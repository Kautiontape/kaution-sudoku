/**
 * Numerical check of the synthesized audio (src/ui/audio/synth.ts), since CI can't listen.
 *
 * Bundles the synth with esbuild, loads it into headless Chromium and renders scripted sessions
 * through an OfflineAudioContext (stereo, 44.1 kHz). The script drives the synth exactly like the
 * app does: methods are called at their times via suspend()/resume(), and the bed scheduler is
 * ticked every 0.25 s like the app's 200 ms timer. Checks:
 *   - a 16 s session per theme (bed, placements 1..9, pencil, completions, erase, mistake, hints,
 *     queen/cross, UI, solved): peak |sample| < 1.0 and ≤ 0.9 (headroom), no NaN/Infinity, overall
 *     RMS clearly non-silent, per-event-window RMS with no window wildly louder than the median
 *   - a "sound map" of every event on its own, plus the finale (last placement + triple completion +
 *     solved at once): relative levels make sense, mistake is muted (low RMS frequency)
 *   - a pile-up (~100 events in 1.5 s) stays under full scale and within the voice cap
 *   - sfx=false and music=false really silence their layers; stopMusic() fades the bed out
 *   - intensity 0 vs 1 (same chords): the bed gets brighter and fuller but stays gentle
 *   - theme changes crossfade without gaps or jumps
 *   - the live singleton: unlock() starts the context, hidden pages suspend it, visible resumes
 *   - every method is safe before unlock(), after unlock(), and with no AudioContext at all
 * Exits 1 if any check fails.
 *
 * Usage: npx tsx scripts/audio-check.ts [--no-wav] [--verbose]
 * Also writes test-results/audio-check-session-<theme>.wav and audio-check-sound-map.wav to listen to.
 */
import { build } from "esbuild";
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SynthModule = typeof import("../src/ui/audio/synth");

interface Ev {
  at: number;
  call: string;
  args: unknown[];
}
interface Win {
  label: string;
  from: number;
  to: number;
}
interface Scenario {
  name: string;
  seconds: number;
  events: Ev[];
  windows: Win[];
  wav: boolean;
  /** Seconds between scheduler ticks / voice-count probes (default 0.25, like the app's timer). */
  tick?: number;
}
interface WinStats extends Win {
  peak: number;
  rms: number;
  /** Brightness proxy: RMS frequency (Hz) = fs · RMS(Δx) / (2π · RMS(x)). A sine at f gives ≈ f. */
  hz: number;
}
interface RenderResult {
  name: string;
  peak: number;
  peakAt: number;
  rms: number;
  nonFinite: number;
  overKnee: number;
  maxVoices: number;
  maxSounding: number;
  maxPadVoices: number;
  windows: WinStats[];
  wav: string | null;
  renderMs: number;
}

const SAMPLE_RATE = 44100;
const TICK = 0.25;
const PEAK_LIMIT = 1.0;
const PEAK_TARGET = 0.9;
const RMS_MIN = 0.01; // −40 dBFS: "clearly non-silent"
const WINDOW_SPREAD_DB = 12; // loudest event window vs the median window
const SILENCE = 1e-4;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const writeWav = !process.argv.includes("--no-wav");
const verbose = process.argv.includes("--verbose");

const db = (x: number): string => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : "-inf").padStart(6);
const ev = (at: number, call: string, ...args: unknown[]): Ev => ({ at, call, args });

// ------------------------------------------------------------------ scenarios

function mainSession(theme: string): Scenario {
  const events: Ev[] = [
    ev(0, "setSettings", { sfx: true, music: true, volume: 1 }),
    ev(0, "setTheme", theme),
    ev(0, "setIntensity", 0),
    ev(0, "startMusic"),
  ];
  for (let d = 1; d <= 9; d++) {
    const at = 1.6 + (d - 1) * 0.2;
    events.push(ev(at, "place", d, { pan: (d - 5) / 4, velocity: 0.8 }), ev(at, "setIntensity", d * 0.06));
  }
  events.push(
    ev(3.5, "note", 5, true),
    ev(3.7, "note", 5, false),
    ev(3.8, "note", 2, true),
    ev(4.0, "complete", ["row"]),
    ev(5.2, "complete", ["row", "col", "box"]),
    ev(5.2, "setIntensity", 0.8),
    ev(6.6, "erase"),
    ev(7.0, "mistake"),
    ev(7.6, "hint", 0),
    ev(8.1, "hint", 2),
    ev(8.6, "queen", 2, 8),
    ev(8.85, "cross"),
    ev(9.1, "ui", "select"),
    ev(9.25, "ui", "tap"),
    ev(9.4, "ui", "open"),
    ev(9.55, "ui", "toggle"),
    ev(9.7, "ui", "close"),
    ev(9.9, "setIntensity", 1),
    ev(10.0, "solved"),
  );
  const windows: Win[] = [
    { label: "bed alone", from: 0.6, to: 1.6 },
    { label: "place 1..9", from: 1.6, to: 3.5 },
    { label: "pencil on/off", from: 3.5, to: 4.0 },
    { label: "complete x1", from: 4.0, to: 5.2 },
    { label: "complete x3", from: 5.2, to: 6.6 },
    { label: "erase", from: 6.6, to: 7.0 },
    { label: "mistake", from: 7.0, to: 7.6 },
    { label: "hint 0, 2", from: 7.6, to: 8.6 },
    { label: "queen + cross", from: 8.6, to: 9.1 },
    { label: "ui x5", from: 9.1, to: 10.0 },
    { label: "solved: swell", from: 10.0, to: 12.3 },
    { label: "solved: resolve", from: 12.3, to: 14.3 },
    { label: "tail + bed", from: 14.3, to: 16.0 },
  ];
  return { name: `session/${theme}`, seconds: 16, events, windows, wav: writeWav };
}

function floodSession(): Scenario {
  const events: Ev[] = [ev(0, "setSettings", { volume: 1 }), ev(0, "setIntensity", 1), ev(0, "startMusic")];
  for (let i = 0; i < 40; i++) events.push(ev(0.5, "place", (i % 9) + 1, { velocity: 1, pan: ((i % 7) - 3) / 3 }));
  for (let i = 0; i < 4; i++) events.push(ev(0.5, "complete", ["row", "col", "box", "cage"]));
  for (let i = 0; i < 3; i++) events.push(ev(0.5, "mistake"));
  events.push(ev(0.5, "solved"), ev(0.5, "hint", 4), ev(0.5, "hint", 4));
  for (let i = 0; i < 5; i++) events.push(ev(0.5, "queen", i, 5));
  for (let i = 0; i < 30; i++) events.push(ev(0.8 + i * 0.03, "place", (i % 9) + 1, { velocity: 1 }));
  for (let i = 0; i < 6; i++) events.push(ev(1.0 + i * 0.1, "complete", ["row", "col", "box"]));
  return {
    name: "pile-up",
    seconds: 6,
    events,
    windows: [
      { label: "pile-up", from: 0.5, to: 2.5 },
      { label: "aftermath", from: 2.5, to: 6 },
    ],
    wav: false,
    tick: 0.05,
  };
}

/** Every event on its own (music off), then the realistic finale: last placement + triple completion + solved at once. */
function soundMapSession(): Scenario {
  const events: Ev[] = [ev(0, "setSettings", { sfx: true, music: false, volume: 1 }), ev(0, "setIntensity", 0)];
  const windows: Win[] = [];
  let t = 0.3;
  const add = (label: string, dur: number, ...calls: [string, ...unknown[]][]): void => {
    for (const [call, ...args] of calls) events.push(ev(t, call, ...args));
    windows.push({ label, from: t, to: t + dur });
    t += dur + 0.2;
  };
  add("place(5)", 2.0, ["place", 5, { velocity: 0.8 }]);
  add("note(5, on)", 0.5, ["note", 5, true]);
  add("note(5, off)", 0.5, ["note", 5, false]);
  add("erase", 0.8, ["erase"]);
  add("complete x1", 2.0, ["complete", ["row"]]);
  add("complete x2", 2.2, ["complete", ["row", "col"]]);
  add("complete x3", 2.5, ["complete", ["row", "col", "box"]]);
  add("complete x4", 2.7, ["complete", ["row", "col", "box", "cage"]]);
  add("mistake", 1.0, ["mistake"]);
  add("hint(0)", 1.5, ["hint", 0]);
  add("hint(4)", 1.5, ["hint", 4]);
  add("queen(3, 8)", 2.0, ["queen", 3, 8]);
  add("cross", 0.5, ["cross"]);
  add("ui select", 0.4, ["ui", "select"]);
  add("ui tap", 0.4, ["ui", "tap"]);
  add("ui open", 0.7, ["ui", "open"]);
  add("ui close", 0.7, ["ui", "close"]);
  add("ui toggle", 0.4, ["ui", "toggle"]);
  add("solved", 6.5, ["solved"]);
  add("finale (place+x3+solved)", 6.5, ["place", 9, { velocity: 0.9 }], ["complete", ["row", "col", "box"]], ["solved"]);
  return { name: "sound map", seconds: t + 0.3, events, windows, wav: writeWav, tick: 0.05 };
}

function gatingSession(): Scenario {
  const events: Ev[] = [ev(0, "setSettings", { sfx: false, music: false, volume: 1 }), ev(0, "startMusic"), ev(0, "setIntensity", 1)];
  const everything = (at: number): Ev[] => [
    ev(at, "place", 5),
    ev(at + 0.1, "note", 3, true),
    ev(at + 0.2, "erase"),
    ev(at + 0.3, "complete", ["row", "col", "box"]),
    ev(at + 0.5, "mistake"),
    ev(at + 0.6, "hint", 3),
    ev(at + 0.7, "queen", 1, 6),
    ev(at + 0.75, "cross"),
    ev(at + 0.8, "ui", "tap"),
    ev(at + 0.9, "ui", "open"),
    ev(at + 1.0, "solved"),
  ];
  events.push(...everything(0.3));
  events.push(ev(5, "setSettings", { music: true }));
  events.push(ev(7, "setSettings", { sfx: true }), ev(7.2, "place", 5));
  events.push(ev(8, "stopMusic"));
  return {
    name: "gating",
    seconds: 15.5,
    events,
    windows: [
      { label: "sfx off, music off", from: 0, to: 5 },
      { label: "music on", from: 6, to: 7 },
      { label: "sfx back on", from: 7.2, to: 7.8 },
      { label: "after stopMusic", from: 15, to: 15.5 },
    ],
    wav: false,
  };
}

/** Bed only, at a fixed intensity. Rendered twice (0 and 1) to A/B the same chords. */
function bedSession(theme: string, intensity: number): Scenario {
  const events: Ev[] = [ev(0, "setSettings", { volume: 1 }), ev(0, "setTheme", theme), ev(0, "setIntensity", intensity), ev(0, "startMusic")];
  return { name: `bed/${theme}@${intensity}`, seconds: 10, events, windows: [{ label: "bed", from: 3, to: 10 }], wav: false };
}

function themeSwitchSession(): Scenario {
  const events: Ev[] = [ev(0, "setSettings", { volume: 1 }), ev(0, "setIntensity", 0.4), ev(0, "startMusic")];
  events.push(ev(4, "setTheme", "ember"), ev(8, "setTheme", "aurora"), ev(12, "setTheme", "abyss"));
  for (let t = 0.6; t < 15.5; t += 1.1) events.push(ev(t, "place", 1 + (Math.round(t * 7) % 9), { velocity: 0.6 }));
  const windows: Win[] = [];
  for (let t = 2; t < 16; t += 0.5) windows.push({ label: `${t.toFixed(1)}s`, from: t, to: t + 0.5 });
  return { name: "theme switches", seconds: 16, events, windows, wav: false };
}

// ------------------------------------------------------------------ in-page code

/** Runs inside Chromium. Must be self-contained: Playwright serializes it. */
async function renderInPage(sc: Scenario & { sampleRate: number; tick: number }): Promise<RenderResult> {
  const tick = sc.tick;
  const lib = (window as unknown as { AudioSynth: SynthModule }).AudioSynth;
  const sr = sc.sampleRate;
  const len = Math.round(sc.seconds * sr);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len, sampleRate: sr });
  const synth = lib.createSynth(ctx);
  const calls = synth as unknown as Record<string, (...a: unknown[]) => unknown>;
  const quantum = 128;
  const groups = new Map<number, Ev[]>();
  const frameOf = (t: number): number => Math.round((t * sr) / quantum) * quantum;
  for (const e of sc.events) {
    const f = frameOf(e.at);
    const g = groups.get(f);
    if (g) g.push(e);
    else groups.set(f, [e]);
  }
  for (let t = tick; t < sc.seconds; t += tick) {
    const f = frameOf(t);
    if (!groups.has(f)) groups.set(f, []);
  }
  let maxVoices = 0;
  let maxSounding = 0;
  let maxPadVoices = 0;
  const run = (evs: Ev[]): void => {
    for (const e of evs) calls[e.call]?.(...e.args);
    synth.tick();
    const s = synth.stats();
    maxVoices = Math.max(maxVoices, s.voices);
    maxSounding = Math.max(maxSounding, s.sounding);
    maxPadVoices = Math.max(maxPadVoices, s.padVoices);
  };
  for (const [frame, evs] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (frame <= 0) run(evs);
    else if (frame < len) {
      void ctx.suspend(frame / sr).then(() => {
        run(evs);
        return ctx.resume();
      });
    }
  }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;

  const chans = [buf.getChannelData(0), buf.getChannelData(1)];
  let peak = 0;
  let peakAt = 0;
  let sum = 0;
  let nonFinite = 0;
  let overKnee = 0;
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) {
      const x = d[i] ?? 0;
      if (!Number.isFinite(x)) {
        nonFinite++;
        continue;
      }
      const a = Math.abs(x);
      if (a > peak) {
        peak = a;
        peakAt = i / sr;
      }
      if (a > 0.88) overKnee++;
      sum += x * x;
    }
  }
  const windows = sc.windows.map((w) => {
    const a = Math.max(0, Math.round(w.from * sr));
    const b = Math.min(len, Math.round(w.to * sr));
    let wp = 0;
    let ws = 0;
    let wd = 0;
    for (const d of chans) {
      for (let i = a; i < b; i++) {
        const x = d[i] ?? 0;
        if (!Number.isFinite(x)) continue;
        wp = Math.max(wp, Math.abs(x));
        ws += x * x;
        const dx = x - (d[i - 1] ?? 0);
        wd += dx * dx;
      }
    }
    const hz = ws > 0 ? (sr * Math.sqrt(wd / ws)) / (2 * Math.PI) : 0;
    return { ...w, peak: wp, rms: Math.sqrt(ws / Math.max(1, 2 * (b - a))), hz };
  });

  let wav: string | null = null;
  if (sc.wav) {
    const n = buf.length;
    const bytes = new ArrayBuffer(44 + n * 4);
    const v = new DataView(bytes);
    const tag = (o: number, s: string): void => {
      for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
    };
    tag(0, "RIFF");
    v.setUint32(4, 36 + n * 4, true);
    tag(8, "WAVE");
    tag(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    tag(36, "data");
    v.setUint32(40, n * 4, true);
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (const d of chans) {
        const x = Math.max(-1, Math.min(1, d[i] ?? 0));
        v.setInt16(o, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
        o += 2;
      }
    }
    const u8 = new Uint8Array(bytes);
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    wav = btoa(s);
  }
  return {
    name: sc.name,
    peak,
    peakAt,
    rms: Math.sqrt(sum / (2 * len)),
    nonFinite,
    overKnee,
    maxVoices,
    maxSounding,
    maxPadVoices,
    windows,
    wav,
    renderMs,
  };
}

/** Runs inside Chromium: every method must be a silent no-op or work, never throw. */
async function apiSafetyInPage(): Promise<string[]> {
  const lib = (window as unknown as { AudioSynth: SynthModule }).AudioSynth;
  const failures: string[] = [];
  const hammer = (label: string, e: Partial<Record<string, unknown>>): void => {
    const calls: [string, unknown[]][] = [
      ["setSettings", [{ sfx: true, music: true, volume: 0.7 }]],
      ["setSettings", [{ volume: Number.NaN }]],
      ["setTheme", ["ember"]],
      ["setTheme", ["not-a-theme"]],
      ["startMusic", []],
      ["setIntensity", [0.5]],
      ["setIntensity", [Number.NaN]],
      ["place", [5, { pan: 0.3, velocity: 0.9 }]],
      ["place", [0]],
      ["place", [42, { pan: 9, velocity: -1 }]],
      ["place", [Number.NaN]],
      ["note", [3, true]],
      ["note", [3, false]],
      ["erase", []],
      ["complete", [["row"]]],
      ["complete", [[]]],
      ["complete", [["row", "col", "box", "cage", "region", "digit", "???"]]],
      ["solved", []],
      ["mistake", []],
      ["hint", [0]],
      ["hint", [99]],
      ["queen", [3, 8]],
      ["queen", [0, 1]],
      ["queen", [5, 0]],
      ["cross", []],
      ["ui", ["select"]],
      ["ui", ["tap"]],
      ["ui", ["open"]],
      ["ui", ["close"]],
      ["ui", ["toggle"]],
      ["ui", ["bogus"]],
      ["stopMusic", []],
      ["unlock", []],
    ];
    for (const [name, args] of calls) {
      try {
        const fn = e[name];
        if (typeof fn !== "function") throw new Error("missing method");
        (fn as (...a: unknown[]) => unknown).apply(e, args);
      } catch (err) {
        failures.push(`${label}: ${name}(${JSON.stringify(args)}) threw ${String(err)}`);
      }
    }
  };
  // 1. The real singleton before unlock(), then after unlock().
  hammer("singleton before unlock", lib.audio as unknown as Record<string, unknown>);
  lib.audio.unlock();
  lib.audio.unlock();
  hammer("singleton after unlock", lib.audio as unknown as Record<string, unknown>);
  // 2. Page visibility round trip.
  try {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    lib.audio.place(5);
    await new Promise((r) => setTimeout(r, 450));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    lib.audio.place(5);
  } catch (err) {
    failures.push(`visibility round trip threw ${String(err)}`);
  }
  // 3. A factory synth on a broken "context".
  try {
    const broken = lib.createSynth({} as unknown as BaseAudioContext);
    hammer("createSynth(garbage)", broken as unknown as Record<string, unknown>);
  } catch (err) {
    failures.push(`createSynth(garbage) threw ${String(err)}`);
  }
  // 4. No Web Audio at all.
  const w = window as unknown as Record<string, unknown>;
  const saved = [w.AudioContext, w.webkitAudioContext];
  try {
    w.AudioContext = undefined;
    w.webkitAudioContext = undefined;
    const e = lib.createAudioEngine();
    hammer("no AudioContext (before unlock)", e as unknown as Record<string, unknown>);
    e.unlock();
    hammer("no AudioContext (after unlock)", e as unknown as Record<string, unknown>);
  } finally {
    w.AudioContext = saved[0];
    w.webkitAudioContext = saved[1];
  }
  return failures;
}

/** Runs inside Chromium: the singleton's realtime lifecycle (unlock → running, hidden → suspended, visible → running). */
async function lifecycleInPage(): Promise<{ steps: [string, string, number][]; error: string | null }> {
  const lib = (window as unknown as { AudioSynth: SynthModule }).AudioSynth;
  const w = window as unknown as { AudioContext: typeof AudioContext };
  const Orig = w.AudioContext;
  const made: AudioContext[] = [];
  w.AudioContext = class extends Orig {
    constructor(opts?: AudioContextOptions) {
      super(opts);
      made.push(this);
    }
  };
  const steps: [string, string, number][] = [];
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const note = (label: string): void => {
    const c = made[0];
    steps.push([label, c ? c.state : "no context", c ? c.currentTime : -1]);
  };
  const setVisibility = (v: "hidden" | "visible"): void => {
    Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  try {
    const e = lib.createAudioEngine();
    e.setSettings({ volume: 0.5 });
    e.setTheme("ember");
    e.startMusic();
    note("before unlock");
    e.unlock();
    e.unlock();
    await sleep(400);
    note("unlocked");
    e.place(5);
    e.complete(["row", "box"]);
    await sleep(600);
    note("playing");
    setVisibility("hidden");
    await sleep(700);
    note("hidden");
    setVisibility("visible");
    await sleep(400);
    note("visible again");
    return { steps, error: made.length === 1 ? null : `expected exactly one AudioContext, got ${made.length}` };
  } catch (err) {
    return { steps, error: String(err) };
  } finally {
    w.AudioContext = Orig;
  }
}

// ------------------------------------------------------------------ driver

async function bundle(): Promise<string> {
  const result = await build({
    entryPoints: [resolve(root, "src/ui/audio/synth.ts")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "AudioSynth",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error("esbuild produced no output");
  return text;
}

async function freshPage(code: string, browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<Page> {
  const page = await browser.newPage();
  page.on("pageerror", (err) => console.error(`  [page error] ${err.message}`));
  await page.setContent("<!doctype html><title>audio-check</title>");
  // tsx compiles this file with keepNames, which wraps functions passed to evaluate() in __name().
  await page.addScriptTag({ content: `globalThis.__name = globalThis.__name || ((fn) => fn);\n${code}` });
  return page;
}

function report(r: RenderResult): void {
  console.log(
    `\n${r.name}: peak ${r.peak.toFixed(3)} (${db(r.peak)} dBFS at ${r.peakAt.toFixed(2)} s) · RMS ${r.rms.toFixed(4)} (${db(r.rms)} dBFS)` +
      ` · NaN/Inf ${r.nonFinite} · samples > 0.88: ${r.overKnee} · voices: max ${r.maxSounding} sounding, ${r.maxVoices} scheduled, ${r.maxPadVoices} bed` +
      ` · rendered in ${Math.round(r.renderMs)} ms`,
  );
  if (!verbose && r.windows.length > 24) return;
  console.log(`  ${"window".padEnd(24)} ${"from".padStart(5)} ${"to".padStart(5)}   peak  RMS dBFS  bright Hz`);
  for (const w of r.windows) {
    console.log(
      `  ${w.label.padEnd(24)} ${w.from.toFixed(1).padStart(5)} ${w.to.toFixed(1).padStart(5)}  ${w.peak.toFixed(3)}  ${db(w.rms)}  ${String(Math.round(w.hz)).padStart(9)}`,
    );
  }
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? 0) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

async function main(): Promise<void> {
  const code = await bundle();
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
    // Let a live AudioContext run without a real gesture, for the lifecycle check.
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const failures: string[] = [];
  const check = (ok: boolean, msg: string): void => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${msg}`);
    if (!ok) failures.push(msg);
  };
  const render = async (sc: Scenario): Promise<RenderResult> => {
    const page = await freshPage(code, browser);
    try {
      const r = await page.evaluate(renderInPage, { ...sc, sampleRate: SAMPLE_RATE, tick: sc.tick ?? TICK });
      report(r);
      if (r.wav) {
        const out = resolve(root, "test-results", `audio-check-${sc.name.replace(/[^a-z0-9]+/gi, "-")}.wav`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, Buffer.from(r.wav, "base64"));
        console.log(`  wrote ${out}`);
      }
      return r;
    } finally {
      await page.close();
    }
  };

  try {
    console.log("audio-check: rendering through OfflineAudioContext (stereo, 44.1 kHz) in headless Chromium");

    for (const theme of ["abyss", "ember", "aurora"]) {
      const r = await render(mainSession(theme));
      const tag = r.name;
      check(r.nonFinite === 0, `${tag}: no NaN/Infinity samples`);
      check(r.peak < PEAK_LIMIT, `${tag}: peak ${r.peak.toFixed(3)} < ${PEAK_LIMIT}`);
      check(r.peak <= PEAK_TARGET, `${tag}: peak ${r.peak.toFixed(3)} ≤ ${PEAK_TARGET} (headroom)`);
      check(r.overKnee === 0, `${tag}: the safety soft clip never engaged (no sample > 0.88)`);
      check(r.rms >= RMS_MIN, `${tag}: overall RMS ${r.rms.toFixed(4)} ≥ ${RMS_MIN} (clearly audible)`);
      const rmsList = r.windows.map((w) => w.rms);
      const med = median(rmsList);
      const loudest = r.windows.reduce((a, b) => (b.rms > a.rms ? b : a));
      const spread = 20 * Math.log10(loudest.rms / med);
      check(spread <= WINDOW_SPREAD_DB, `${tag}: loudest window "${loudest.label}" is ${spread.toFixed(1)} dB over the median window (≤ ${WINDOW_SPREAD_DB} dB)`);
      check(r.windows.every((w) => w.rms > SILENCE), `${tag}: every window is audible (no dropouts)`);
      check(r.maxPadVoices <= 3, `${tag}: at most 3 bed voices at once (${r.maxPadVoices})`);
    }

    {
      const r = await render(soundMapSession());
      const w = (label: string): WinStats => r.windows.find((x) => x.label === label)!;
      const ref = w("place(5)").peak;
      check(r.nonFinite === 0, "sound map: no NaN/Infinity samples");
      check(r.windows.every((x) => x.peak > 0.002), "sound map: every event makes a sound");
      const loudest = r.windows.reduce((a, b) => (b.peak > a.peak ? b : a));
      const over = 20 * Math.log10(loudest.peak / ref);
      check(over <= 8, `sound map: loudest event "${loudest.label}" peaks ${over.toFixed(1)} dB over place() (≤ 8 dB)`);
      check(w("ui select").peak < w("ui tap").peak && w("ui tap").peak < ref, "sound map: select < tap < place");
      check(w("note(5, on)").peak < ref * 0.5 && w("note(5, off)").peak < ref * 0.5, "sound map: pencil ticks are much softer than placements");
      check(w("complete x3").rms > w("complete x1").rms, "sound map: a triple completion is bigger than a single");
      check(w("solved").rms > w("complete x1").rms, "sound map: solved is bigger than a single completion");
      check(w("mistake").peak <= ref * 1.12, "sound map: mistake is no louder than a placement");
      check(w("mistake").hz < 600, `sound map: mistake is muted (RMS frequency ${Math.round(w("mistake").hz)} Hz < 600 Hz)`);
      check(r.peak <= PEAK_TARGET, `sound map: peak ${r.peak.toFixed(3)} ≤ ${PEAK_TARGET} including the finale`);
      check(r.maxSounding <= 24 + 8, `sound map: sounding voices bounded (${r.maxSounding})`);
    }

    {
      const r = await render(floodSession());
      check(r.nonFinite === 0, "pile-up: no NaN/Infinity samples");
      check(r.peak < PEAK_LIMIT, `pile-up: peak ${r.peak.toFixed(3)} < ${PEAK_LIMIT} even with ~100 events in 1.5 s`);
      check(r.maxSounding <= 24 + 8, `pile-up: sounding voices bounded (${r.maxSounding} ≤ 32 incl. voices fading out after being stolen)`);
    }

    {
      const r = await render(gatingSession());
      const w = (label: string): WinStats => r.windows.find((x) => x.label === label)!;
      check(w("sfx off, music off").peak === 0, `gating: sfx=false + music=false is digital silence (peak ${w("sfx off, music off").peak})`);
      check(w("music on").rms > 0.003, `gating: music=true brings the bed in (RMS ${w("music on").rms.toFixed(4)})`);
      check(w("sfx back on").peak > w("music on").peak * 1.5, "gating: sfx=true makes place() audible again");
      check(w("after stopMusic").rms < SILENCE, `gating: stopMusic() fades the bed to silence (RMS ${w("after stopMusic").rms.toExponential(1)})`);
      check(r.nonFinite === 0 && r.peak < PEAK_TARGET, "gating: clean levels");
    }

    for (const theme of ["abyss", "ember", "aurora"]) {
      const lo = (await render(bedSession(theme, 0))).windows[0]!;
      const hi = (await render(bedSession(theme, 1))).windows[0]!;
      const tag = `bed/${theme}`;
      check(hi.hz > lo.hz * 1.3, `${tag}: intensity brightens the bed (${Math.round(lo.hz)} Hz → ${Math.round(hi.hz)} Hz RMS frequency)`);
      check(hi.rms > lo.rms, `${tag}: intensity fills the bed out (${db(lo.rms)} → ${db(hi.rms)} dBFS)`);
      check(lo.rms < 0.035 && hi.peak < 0.4, `${tag}: a gentle bed (${db(lo.rms)} dBFS RMS at rest ≤ −29, peak ${hi.peak.toFixed(2)} at full intensity)`);
    }

    {
      const r = await render(themeSwitchSession());
      const rmsList = r.windows.map((x) => x.rms);
      const lo = Math.min(...rmsList);
      const hi = Math.max(...rmsList);
      check(r.nonFinite === 0 && r.peak < PEAK_TARGET, `theme switches: clean levels (peak ${r.peak.toFixed(3)})`);
      check(lo > SILENCE * 10, `theme switches: no gap while crossfading (quietest 0.5 s window ${db(lo)} dBFS)`);
      check(20 * Math.log10(hi / lo) < 18, `theme switches: smooth (loudest/quietest window ${(20 * Math.log10(hi / lo)).toFixed(1)} dB)`);
      check(r.maxPadVoices <= 3, `theme switches: at most 3 bed voices at once (${r.maxPadVoices})`);
    }

    {
      console.log("\nRealtime lifecycle (live AudioContext via the lazy singleton)");
      const page = await freshPage(code, browser);
      try {
        const { steps, error } = await page.evaluate(lifecycleInPage);
        for (const [label, state, time] of steps) console.log(`  ${label.padEnd(14)} ${state.padEnd(10)} currentTime ${time.toFixed(3)}`);
        const at = (label: string): [string, string, number] => steps.find((x) => x[0] === label) ?? [label, "missing", -1];
        check(error === null, `lifecycle: one AudioContext, created lazily by unlock() (${error ?? "ok"})`);
        check(at("before unlock")[1] === "no context", "lifecycle: nothing is created before unlock()");
        check(at("unlocked")[1] === "running" && at("playing")[2] > at("unlocked")[2], "lifecycle: unlock() starts a running context");
        check(at("hidden")[1] === "suspended", "lifecycle: a hidden page fades out and suspends the context");
        check(at("visible again")[1] === "running", "lifecycle: becoming visible resumes it");
      } finally {
        await page.close();
      }
    }

    {
      console.log("\nAPI safety (singleton before/after unlock, visibility, garbage context, no AudioContext)");
      const page = await freshPage(code, browser);
      try {
        const errs = await page.evaluate(apiSafetyInPage);
        for (const e of errs) console.log(`  ${e}`);
        check(errs.length === 0, "API safety: no method ever throws");
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.log(`\naudio-check: ${failures.length} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\naudio-check: all checks passed");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
