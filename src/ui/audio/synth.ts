/**
 * Sound engine: "the player's moves play the music".
 *
 * Everything is synthesized with the Web Audio API: no samples, no libraries, no per-sample JS at
 * playback (no ScriptProcessor / AudioWorklet). The reverb impulse response and a 2 s noise buffer
 * are generated once per context (dsp.ts) and reused. Music tables live in theory.ts.
 *
 * USAGE
 *   import { audio } from "./ui/audio/synth";
 *   addEventListener("pointerdown", () => audio.unlock());   // first gesture creates the context
 *   audio.setTheme("abyss"); audio.startMusic();
 *   audio.place(digit, { pan: (col - 4) / 4 }); audio.setIntensity(filled / 81);
 *   `createSynth(ctx)` builds the same engine on any context, e.g. an OfflineAudioContext
 *   (scripts/audio-check.ts renders and measures it that way).
 *
 * SIGNAL FLOW
 *   effect voices ─► panner ─► dryBus (reverb 0.15)                     ┐
 *                          └─► wetBus (reverb 0.42, delay 0.22)          │
 *   bed chords ─► lowpass (+ shared LFO) ─► env ─► padBus (reverb 0.5)   ├─► mix ─► master (volume²)
 *   shimmer, sparkles ─► fxBus (reverb 0.8, delay 0.4)                   │   ─► focus (visibility fade)
 *   reverb: highpass 180 Hz ─► Convolver (2.9 s stereo IR, 22 ms pre) ───┤   ─► DynamicsCompressor
 *   delay: 375 ms left / 500 ms right, filtered feedback 0.36 ───────────┘      (−16 dB, 3:1, knee 12,
 *                                                                               ~+4 dB auto makeup)
 *                                                                           ─► soft clip ─► destination
 *   The soft clip (WaveShaper) is the identity below 0.88 FS and bends towards 0.98, so even a
 *   pathological pile-up cannot wrap or clip; normal play never reaches it. The dry/wet buses are the
 *   sfx on/off gates; the bed is switched by fading its voices.
 *
 * VOICES: an effect voice is one note/whoosh with its own nodes; it stops after attack + 5 decay time
 * constants (−43 dB) and then disconnects everything. If 24 voices will be sounding when a new one
 * starts, the quietest by envelope estimate is faded out in 40 ms (or the newcomer is dropped if it
 * would be the quietest). A per-event crowd factor 1 / (1 + 0.25 · max(0, density − 2.5)), with event
 * density decaying at tau 0.6 s, turns down rapid-fire events so flurries cannot stack up. Every
 * effect is pitched from the *current chord*, so whatever the player does lands in key.
 *
 * HARMONY: a timeline of anchors {time, chord, theme}. Chords advance every `chordDur` (abyss 9 s,
 * ember 8 s, aurora 7.5 s), even with music off, so effects keep moving through the progression.
 * The bed scheduler (`tick()`: 200 ms timer, 2.6 s lookahead) schedules one pad voice per chord with
 * equal-power crossfades centred on the boundaries. A theme change crossfades into the new theme's
 * first chord; `solved()` holds the current chord and lands on the tonic at the resolution.
 *
 * THEMES (theory.ts)
 *   abyss  — D Dorian with a Lydian Bb: Dm9 → Bbmaj7#11 → Fmaj9 → G6/9. Saw+triangle pad, dark
 *            filter (380 Hz → 2.3 kHz), glassy 3:1 FM bell with a triangle body.
 *   ember  — A minor / F Lydian: Am9 → Fmaj7#11 → Dm9 → Em7(11). Twin-saw pad with a warm resonant
 *            filter (Q 1.4), soft 4:1 mallet with a strong body and a shorter ring.
 *   aurora — E major pentatonic: E6/9 → C#m7 → Amaj9 → Bsus(add9). Triangle+saw pad, brightest
 *            filter (700 Hz → 3.8 kHz), inharmonic 3.5:1 chime with an airy octave-up sine body.
 *   Melody sets are chord tones + extensions with no two a semitone apart, so any note is consonant.
 *
 * SOUND MAP. "gain" = the LV constant (peak gain into the mix at velocity 1); "peak" = measured
 * output peak of the event alone at volume 1 (scripts/audio-check.ts, abyss); a placement is 0.22.
 *   bed          per-chord pad (5 notes × 2 detuned oscillators, hard L/R) + sine sub, LFO-swept
 *                lowpass; −31.7 dBFS RMS at rest in every theme. Intensity opens the filter (RMS
 *                frequency ~320 → ~1000 Hz), fades in a detuned high-sine shimmer and sparse
 *                sparkle bells (≈1/s at full flow) for ≈ +1.6–2.2 dB.
 *   place(d)     FM bell on ladder note d (digit 1 = first chord tone ≥ theme floor; 9 notes ≈ 2
 *                octaves), 3 ms attack, ~1–1.6 s ring, ±7 % velocity jitter.   gain 0.21  peak 0.22
 *   note(d,on)   on: tiny FM tick an octave above d; off: softer, lower, gliding down. 0.045/0.03  0.05
 *   erase        downward band-passed noise swish + falling sine.                 0.07/0.035  0.10
 *   complete(k)  rising chord-tone arpeggio, 5/7/9/11 notes at 65/60/55/50 ms for 1/2/3/4+ kinds,
 *                octave doublings from 2, bloom chord from 2, sparkle crown from 3, whoosh-up and
 *                soft thump; tails grow with the count.         peaks 0.30 / 0.37 / 0.42 / 0.45
 *   solved       2.3 s of noise riser + swelling chord + accelerating 14-note cascade while the bed
 *                breathes out; then the tonic lands: strummed 6-note bell chord, long bloom, thump,
 *                sparkle shower, and the bed returns on the tonic. ~6 s.                 peak 0.48
 *   mistake      muted thud (root + a beating minor second, 420 Hz lowpass) and a 3-step filtered
 *                square stutter a semitone off a chord tone. RMS frequency ~210 Hz. 0.075/0.025  0.24
 *   hint(r)      2–3 note rising glass chime; each rung starts higher with more FM shine.  0.14–0.25
 *   queen(c,n)   column spread over the 9-note ladder; longer bell with an octave-below body.  0.25
 *   cross        tiny band-passed noise tick + high sine pip.                                  0.05
 *   ui           select sine pip 0.02 · tap triangle tock 0.06 · open/close two-note glass rise/fall
 *                with an air swish 0.06–0.07 · toggle double tick 0.07.
 *   Whole sessions peak ≈ 0.5 (−6 dBFS) at volume 1; the finale (last placement + triple completion +
 *   solved at once) 0.46; a 100-event pile-up 0.86.
 *
 * ROBUSTNESS: every public method is wrapped so it can never throw into the game. Without Web Audio
 * (Node, very old browsers) the singleton is a silent no-op. `settings.sfx = false` closes the effect
 * buses and skips effect voices; `settings.music = false` fades the bed out. `unlock()` resumes a
 * suspended (or iOS "interrupted") context. On `visibilitychange` → hidden the output fades and the
 * context suspends; visible resumes it.
 */

import { mulberry32 } from "../../engine/rng";
import {
  CLIP_RANGE,
  FADE_IN,
  FADE_OUT,
  clamp,
  finite,
  glide,
  impulseResponse,
  pluck,
  smoothstep,
  softClipCurve,
  toAudioBuffer,
  volumeGain,
  whiteNoise,
} from "./dsp";
import {
  THEMES,
  digitNote,
  isTheme,
  ladder,
  mtof,
  spreadIndex,
  type AudioTheme,
  type BellTimbre,
  type ChordDef,
  type ThemeDef,
} from "./theory";

export type { AudioTheme } from "./theory";

export interface AudioSettings {
  sfx: boolean;
  music: boolean;
  /** 0..1 master volume (perceptual curve: gain = volume²). */
  volume: number;
}

export type UiSound = "tap" | "open" | "close" | "toggle" | "select";

export interface SoundEngine {
  /** From a user gesture (pointerdown). Creates/resumes the AudioContext. Idempotent. No-op when Web Audio is unavailable. */
  unlock(): void;
  setSettings(s: Partial<AudioSettings>): void;
  /** Theme = key/mode, chord progression, pad timbre. Crossfade on change. */
  setTheme(t: AudioTheme): void;
  /** Ambient bed on/off (still gated by settings.music). */
  startMusic(): void;
  stopMusic(): void;
  /** 0..1 "flow" (e.g. fraction of puzzle solved): opens the pad filter, adds a shimmer layer, livelier sparkles. Ramp smoothly. */
  setIntensity(x: number): void;
  /** Digit 1..9 placed: bell/mallet note, pitch = digit mapped onto the current chord's tones (higher digit → higher note, always consonant). pan -1..1. */
  place(digit: number, opts?: { pan?: number; velocity?: number }): void;
  /** Pencil mark toggled: very soft short tick pitched by digit. */
  note(digit: number, on: boolean): void;
  erase(): void;
  /** Completions that happened together, e.g. ["row","box"]. kinds: "row"|"col"|"box"|"cage"|"region"|"digit". More at once → bigger, longer response. */
  complete(kinds: string[]): void;
  /** Puzzle solved: swell + cascading arpeggio + resolution to the tonic, ~4–6 s. */
  solved(): void;
  /** Wrong move: muted, slightly dissonant low thud with a short glitchy blip. Never harsh. */
  mistake(): void;
  /** Hint opened (rung 0) or advanced (rung 1..4): soft rising chime, a little brighter per rung. */
  hint(rung: number): void;
  /** Queens: queen placed in column col of an n×n board → bell note; cross placed → tiny tick. */
  queen(col: number, n: number): void;
  cross(): void;
  /** Generic UI: "select" (cell selection — extremely subtle), "tap", "open", "close", "toggle". */
  ui(kind: UiSound): void;
}

export interface SynthStats {
  /** Effect voices that exist (sounding now or scheduled to start soon). */
  voices: number;
  /** Effect voices sounding right now (bells, whooshes, sparkles…): at most MAX_VOICES plus a few being stolen. */
  sounding: number;
  /** Live bed chord voices (1 normally, 2–3 while crossfading). */
  padVoices: number;
  theme: AudioTheme;
  chord: string;
  intensity: number;
  musicPlaying: boolean;
}

/** A synth bound to one context. `createSynth` returns this; the `audio` singleton wraps one. */
export interface Synth extends SoundEngine {
  readonly context: BaseAudioContext;
  /** Advance the ambient scheduler. Call every ~100–250 ms (the singleton uses 200 ms); every public method also ticks. */
  tick(): void;
  /** Fade the whole output out (false) or back in (true), e.g. while the page is hidden. */
  setFocus(focused: boolean): void;
  stats(): SynthStats;
  /** Stop everything and disconnect from the destination. */
  dispose(): void;
}

export interface SynthOptions {
  /** Seed for the humanization PRNG (velocity jitter, sparkle timing, pans). */
  seed?: number;
}

export const DEFAULT_SETTINGS: Readonly<AudioSettings> = { sfx: true, music: true, volume: 0.8 };

/** Maximum simultaneous effect voices; beyond it the quietest is stolen (40 ms fade). */
export const MAX_VOICES = 24;

const LOOKAHEAD = 2.6; // s: bed chords are scheduled this far ahead (> xfade/2 + timer jitter)
const SPARKLE_STEP = 0.25; // s: grid on which sparkles may occur
const SPARKLE_AHEAD = 0.5; // s
const SPARKLE_P = 0.24; // max chance per step (intensity 1) ≈ 1 sparkle/s
const I_TAU = 1.1; // s: intensity smoothing time constant
const RES_DELAY = 2.3; // s: solved() call → tonic resolution
const STOP_FADE = 2.2; // s: bed fade on stopMusic / music off
const STEAL_FADE = 0.04; // s
const LAT = 0.008; // s: schedule "now" events slightly ahead so attacks are never truncated
const RING = 5; // effect voices stop after attack + RING decay time constants (−43 dB)
const NOISE_LOUDNESS = 0.3; // band-passed noise is much quieter than its gain; used for stealing estimates
const TICK_MS = 200;

/** Mix levels (peak gain at velocity 1). Tuned with scripts/audio-check.ts. */
const LV = {
  bed: 0.012,
  place: 0.21,
  noteOn: 0.045,
  noteOff: 0.03,
  erase: 0.035,
  eraseNoise: 0.07,
  arp: 0.09,
  bloom: 0.024,
  whoosh: 0.11,
  thump: 0.1,
  crown: 0.045,
  riser: 0.12,
  swell: 0.024,
  cascade: 0.085,
  resolve: 0.085,
  resolveBloom: 0.03,
  shower: 0.04,
  thud: 0.075,
  glitch: 0.025,
  hint: 0.06,
  queen: 0.19,
  cross: 0.045,
  select: 0.012,
  tap: 0.04,
  open: 0.035,
  toggle: 0.035,
  sparkle: 0.04,
  shimmer: 0.006,
  reverb: 0.85,
  delay: 0.5,
} as const;

/** Bus sends. */
const SEND = { pad: 0.5, fxRev: 0.8, fxDly: 0.4, dry: 0.15, wetRev: 0.42, wetDly: 0.22 } as const;

const DELAY_TAPS: readonly (readonly [number, number])[] = [
  [0.375, -0.6],
  [0.5, 0.6],
];
const DELAY_FEEDBACK = 0.36;

/** Arpeggio start offset per completion kind (so a row and a column sound a little different). */
const KIND_OFFSET: Readonly<Record<string, number>> = { row: 0, col: 1, box: 2, cage: 1, region: 0, digit: 3 };

const noop = (): void => {};

interface Seg {
  idx: number;
  th: ThemeDef;
  chord: ChordDef;
  start: number;
  end: number;
}

interface Anchor {
  t: number;
  idx: number;
  th: ThemeDef;
  /** Hold this chord until the next anchor (used by solved()). */
  hold: boolean;
}

interface Voice {
  t0: number;
  /** Stop time shared by all sources (Infinity until known: bed voices). */
  end: number;
  /** Final gain: static `base` until killed, then a linear fade to 0. */
  out: GainNode;
  base: number;
  srcs: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  cleanup: (() => void) | null;
  killStart: number;
  killEnd: number;
  killFrom: number;
  done: boolean;
  /** Envelope estimate for voice stealing: peak loudness, attack, decay time constant. */
  imp: number;
  atk: number;
  tau: number;
  // bed voices only
  seg?: Seg;
  env?: GainNode;
  filter?: BiquadFilterNode;
  inEnd?: number;
  released?: boolean;
}

/** Envelope summary of an effect voice: rough peak loudness, attack (s), decay time constant (s). */
interface Shape {
  imp: number;
  atk: number;
  tau: number;
}

interface ToneArgs {
  t: number;
  midi: number;
  level: number;
  tau: number;
  atk?: number;
  type?: OscillatorType;
  pan?: number;
  bus?: AudioNode;
  /** FM modulator: ratio to the carrier, peak index, index decay time constant. */
  fm?: { ratio: number; index: number; tau: number };
  /** Frequency multiplier reached after `glideTime` (exponential). */
  glide?: number;
  glideTime?: number;
  /** Second oscillator: level relative to the carrier, frequency ratio, shape, decay multiplier. */
  body?: { level: number; ratio: number; type: OscillatorType; tauMul: number };
}

interface BellArgs {
  midi: number;
  t: number;
  vel: number;
  level: number;
  pan?: number;
  bus?: AudioNode;
  timbre?: Partial<BellTimbre>;
  tauMul?: number;
  body?: number;
  bodyRatio?: number;
  bodyWave?: OscillatorType;
}

/**
 * Build a synth on `ctx` (a live AudioContext or an OfflineAudioContext) feeding `destination`
 * (default `ctx.destination`). Never throws: if the graph cannot be built it returns a silent synth.
 */
export function createSynth(ctx: BaseAudioContext, destination?: AudioNode, opts: SynthOptions = {}): Synth {
  try {
    return buildSynth(ctx, destination ?? ctx.destination, opts);
  } catch {
    return silentSynth(ctx);
  }
}

function silentSynth(ctx: BaseAudioContext): Synth {
  return {
    context: ctx,
    unlock: noop,
    setSettings: noop,
    setTheme: noop,
    startMusic: noop,
    stopMusic: noop,
    setIntensity: noop,
    place: noop,
    note: noop,
    erase: noop,
    complete: noop,
    solved: noop,
    mistake: noop,
    hint: noop,
    queen: noop,
    cross: noop,
    ui: noop,
    tick: noop,
    setFocus: noop,
    stats: () => ({ voices: 0, sounding: 0, padVoices: 0, theme: "abyss", chord: "", intensity: 0, musicPlaying: false }),
    dispose: noop,
  };
}

function buildSynth(ctx: BaseAudioContext, dest: AudioNode, opts: SynthOptions): Synth {
  const rng = mulberry32(opts.seed ?? 0x5eed);
  const rand = (lo: number, hi: number): number => lo + (hi - lo) * rng();
  const isOffline = "startRendering" in ctx;
  const canPan = typeof (ctx as Partial<BaseAudioContext>).createStereoPanner === "function";

  const settings: AudioSettings = { ...DEFAULT_SETTINGS };
  let theme: ThemeDef = THEMES.abyss;
  let musicWanted = false;
  let playing = false;
  let disposed = false;

  // ---------------------------------------------------------------- output chain
  const mix = ctx.createGain();
  const master = ctx.createGain();
  master.gain.value = volumeGain(settings.volume);
  const focus = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const clipIn = ctx.createGain();
  clipIn.gain.value = 1 / CLIP_RANGE;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = "none";
  mix.connect(master).connect(focus).connect(comp).connect(clipIn).connect(clip).connect(dest);

  const makePanner = (pan: number): StereoPannerNode | null => {
    if (!canPan) return null;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    return p;
  };

  // Reverb (low end stays dry so subs and thumps don't boom).
  const revIn = ctx.createGain();
  const revHp = ctx.createBiquadFilter();
  revHp.type = "highpass";
  revHp.frequency.value = 180;
  revHp.Q.value = 0.6;
  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.buffer = toAudioBuffer(ctx, impulseResponse(ctx.sampleRate, 2.9, 0.022, rng));
  const revOut = ctx.createGain();
  revOut.gain.value = LV.reverb;
  revIn.connect(revHp).connect(conv).connect(revOut).connect(mix);

  // Stereo feedback delay: two taps, each echo darker and thinner than the last.
  const dlyIn = ctx.createGain();
  const dlyOut = ctx.createGain();
  dlyOut.gain.value = LV.delay;
  for (const [time, pan] of DELAY_TAPS) {
    const d = ctx.createDelay(1);
    d.delayTime.value = time;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    lp.Q.value = 0.4;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 260;
    hp.Q.value = 0.4;
    const fb = ctx.createGain();
    fb.gain.value = DELAY_FEEDBACK;
    dlyIn.connect(d);
    d.connect(lp).connect(hp).connect(fb).connect(d);
    const p = makePanner(pan);
    if (p) hp.connect(p).connect(dlyOut);
    else hp.connect(dlyOut);
  }
  dlyOut.connect(mix);
  const dlyToRev = ctx.createGain();
  dlyToRev.gain.value = 0.3;
  dlyOut.connect(dlyToRev).connect(revIn);

  const bus = (rev: number, dly: number): GainNode => {
    const b = ctx.createGain();
    b.connect(mix);
    if (rev > 0) {
      const s = ctx.createGain();
      s.gain.value = rev;
      b.connect(s).connect(revIn);
    }
    if (dly > 0) {
      const s = ctx.createGain();
      s.gain.value = dly;
      b.connect(s).connect(dlyIn);
    }
    return b;
  };
  const padBus = bus(SEND.pad, 0);
  const fxBus = bus(SEND.fxRev, SEND.fxDly);
  const dryBus = bus(SEND.dry, 0);
  const wetBus = bus(SEND.wetRev, SEND.wetDly);
  const shimBus = ctx.createGain();
  shimBus.gain.value = 0;
  shimBus.connect(fxBus);

  // Shared slow LFO → every bed chord's filter detune (cents).
  const lfo = ctx.createOscillator();
  lfo.frequency.value = theme.pad.lfoRate;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = theme.pad.lfoDepth;
  lfo.connect(lfoDepth);
  lfo.start();

  const noiseBuf = toAudioBuffer(ctx, whiteNoise(ctx.sampleRate, 2, rng));

  // ---------------------------------------------------------------- intensity
  let iFrom = 0;
  let iTo = 0;
  let iT0 = 0;
  const intensityAt = (t: number): number => iTo + (iFrom - iTo) * Math.exp(-Math.max(0, t - iT0) / I_TAU);
  const cutoff = (th: ThemeDef, x: number): number => th.pad.cutoffLo * Math.pow(th.pad.cutoffHi / th.pad.cutoffLo, clamp(x, 0, 1));
  const shimLevel = (x: number): number => LV.shimmer * smoothstep(0.15, 1, x);

  // ---------------------------------------------------------------- harmony timeline
  let anchors: Anchor[] = [{ t: 0, idx: 0, th: theme, hold: false }];

  function segmentAt(t: number): Seg {
    let i = 0;
    while (i + 1 < anchors.length && anchors[i + 1]!.t <= t) i++;
    const a = anchors[i]!;
    const next = anchors[i + 1];
    const limit = next ? next.t : Infinity;
    const n = a.th.chords.length;
    let k = 0;
    let start = a.t;
    let end = limit;
    if (!a.hold) {
      k = Math.max(0, Math.floor((t - a.t) / a.th.chordDur));
      start = a.t + k * a.th.chordDur;
      end = Math.min(start + a.th.chordDur, limit);
    }
    const idx = (((a.idx + k) % n) + n) % n;
    return { idx, th: a.th, chord: a.th.chords[idx]!, start, end };
  }

  function setAnchor(t: number, idx: number, th: ThemeDef, hold = false): void {
    anchors = anchors.filter((a) => a.t < t);
    anchors.push({ t, idx, th, hold });
    const now = ctx.currentTime;
    while (anchors.length > 1 && anchors[1]!.t <= now) anchors.shift();
  }

  // ---------------------------------------------------------------- voices
  const voices: Voice[] = [];
  const pads: Voice[] = [];
  let lastPad: Voice | null = null;
  let shim: { v: Voice; oscs: OscillatorNode[] } | null = null;

  function finish(v: Voice): void {
    if (v.done) return;
    v.done = true;
    for (const n of v.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    v.cleanup?.();
    for (const list of [voices, pads]) {
      const i = list.indexOf(v);
      if (i >= 0) list.splice(i, 1);
    }
    if (lastPad === v) lastPad = null;
  }

  function prune(list: Voice[], now: number): void {
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i]!;
      if (v.done || v.end < now - 0.05) finish(v);
    }
  }

  function makeVoice(list: Voice[], t: number, end: number, busNode: AudioNode, pan: number, base: number): Voice {
    const out = ctx.createGain();
    out.gain.value = base;
    const v: Voice = {
      t0: t,
      end,
      out,
      base,
      srcs: [],
      nodes: [out],
      cleanup: null,
      killStart: 0,
      killEnd: Infinity,
      killFrom: base,
      done: false,
      imp: base,
      atk: 0,
      tau: Infinity,
    };
    const p = pan !== 0 ? makePanner(pan) : null;
    if (p) {
      out.connect(p).connect(busNode);
      v.nodes.push(p);
    } else out.connect(busNode);
    list.push(v);
    return v;
  }

  /** Rough loudness of an effect voice at time `at`, from its envelope shape. */
  function loudnessAt(v: Voice, at: number): number {
    if (v.killEnd !== Infinity) return 0;
    if (at <= v.t0 + v.atk) return v.imp;
    return v.imp * Math.exp(-(at - v.t0 - v.atk) / v.tau);
  }

  /**
   * New effect voice. If MAX_VOICES others will still be sounding when it starts, the quietest of
   * them (by envelope estimate) is faded out in 40 ms, unless the newcomer would itself be the
   * quietest, in which case it is dropped. Voices that end before it starts don't count.
   */
  function sfxVoice(t: number, dur: number, busNode: AudioNode, pan: number, shape: Shape): Voice | null {
    const now = ctx.currentTime;
    prune(voices, now);
    const at = Math.max(now, t);
    let active = 0;
    let fading = 0;
    let victim: Voice | null = null;
    let quietest = Infinity;
    for (const v of voices) {
      if (v.end <= at) continue;
      if (v.killEnd !== Infinity) {
        fading++;
        continue;
      }
      active++;
      const l = loudnessAt(v, at);
      if (l < quietest) {
        quietest = l;
        victim = v;
      }
    }
    if (active >= MAX_VOICES) {
      if (!victim || quietest >= shape.imp) return null;
      kill(victim, STEAL_FADE);
      fading++;
    }
    if (active + fading >= MAX_VOICES + 8) return null;
    const v = makeVoice(voices, t, t + dur, busNode, pan, 1);
    v.imp = shape.imp;
    v.atk = shape.atk;
    v.tau = shape.tau;
    return v;
  }

  /** Register a source that the caller has already started: shared stop time, cleanup on end. */
  function addSrc<T extends AudioScheduledSourceNode>(v: Voice, s: T): T {
    if (Number.isFinite(v.end)) s.stop(v.end);
    if (v.srcs.length === 0) s.onended = () => finish(v);
    v.srcs.push(s);
    v.nodes.push(s);
    return s;
  }

  function osc(v: Voice, type: OscillatorType, freq: number, at = v.t0): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start(at);
    return addSrc(v, o);
  }

  function noise(v: Voice, at = v.t0): AudioBufferSourceNode {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    n.start(at, rand(0, 1.5));
    return addSrc(v, n);
  }

  function gainNode(v: Voice, value = 0): GainNode {
    const g = ctx.createGain();
    g.gain.value = value;
    v.nodes.push(g);
    return g;
  }

  function biquad(v: Voice, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    v.nodes.push(f);
    return f;
  }

  /** Bring a voice's stop time forward (never later: with Web Audio the last stop() call wins). */
  function stopSources(v: Voice, at: number): void {
    if (at >= v.end) return;
    for (const s of v.srcs) {
      try {
        s.stop(at);
      } catch {
        /* some engines refuse a second stop(); the kill gain already silences it */
      }
    }
    v.end = at;
  }

  function killValue(v: Voice, t: number): number {
    if (v.killEnd === Infinity) return v.base;
    if (t <= v.killStart) return v.killFrom;
    if (t >= v.killEnd) return 0;
    return v.killFrom * (1 - (t - v.killStart) / (v.killEnd - v.killStart));
  }

  /**
   * Fade a voice out from now (linear, on its own output gain, which nothing else automates) and
   * stop its sources. Safe to call repeatedly: a later call can only make the fade shorter, and it
   * starts from the analytically known current value, so there is never a jump.
   */
  function kill(v: Voice, fade: number): void {
    if (v.done) return;
    const now = ctx.currentTime;
    const end = now + Math.max(0.005, fade);
    if (end >= v.killEnd) return;
    const from = killValue(v, now);
    const g = v.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(from, now);
    g.linearRampToValueAtTime(0, end);
    v.killStart = now;
    v.killEnd = end;
    v.killFrom = from;
    stopSources(v, end + 0.02);
  }

  // ---------------------------------------------------------------- instruments
  function tone(a: ToneArgs): Voice | null {
    const atk = a.atk ?? 0.003;
    const bodyLevel = a.body?.level ?? 0;
    const dur = atk + a.tau * Math.max(1, a.body?.tauMul ?? 1) * RING + 0.01;
    const v = sfxVoice(a.t, dur, a.bus ?? dryBus, a.pan ?? 0, { imp: a.level * (1 + bodyLevel), atk, tau: a.tau });
    if (!v) return null;
    const f = mtof(a.midi);
    const car = osc(v, a.type ?? "sine", f);
    if (a.glide !== undefined) {
      car.frequency.setValueAtTime(f, a.t);
      car.frequency.exponentialRampToValueAtTime(f * a.glide, a.t + (a.glideTime ?? a.tau * 2));
    }
    if (a.fm) {
      const mod = osc(v, "sine", f * a.fm.ratio);
      const mg = gainNode(v);
      const dev = f * a.fm.ratio * a.fm.index;
      mg.gain.setValueAtTime(dev, a.t);
      mg.gain.setTargetAtTime(dev * 0.05, a.t, a.fm.tau);
      mod.connect(mg).connect(car.frequency);
    }
    const amp = gainNode(v);
    pluck(amp.gain, a.t, atk, a.level, a.tau);
    car.connect(amp).connect(v.out);
    if (a.body && bodyLevel > 0) {
      const b = osc(v, a.body.type, f * a.body.ratio);
      const bg = gainNode(v);
      pluck(bg.gain, a.t, atk + 0.001, a.level * a.body.level, a.tau * a.body.tauMul);
      b.connect(bg).connect(v.out);
    }
    return v;
  }

  /** The signature FM bell / mallet, using the current theme's timbre. */
  function bell(a: BellArgs): void {
    const tb: BellTimbre = { ...theme.bell, ...a.timbre };
    const hi = (a.midi - 66) / 30; // register: 0 around F#4, 1 around C7
    const vel = clamp(a.vel, 0.05, 1);
    const tau = tb.tau * (a.tauMul ?? 1) * clamp(1 - 0.3 * hi, 0.6, 1.25);
    tone({
      t: a.t,
      midi: a.midi,
      level: a.level * Math.pow(vel, 1.3),
      tau,
      atk: 0.003,
      pan: a.pan ?? 0,
      bus: a.bus ?? wetBus,
      fm: { ratio: tb.ratio, index: tb.index * clamp(1 - 0.45 * hi, 0.45, 1.3) * (0.55 + 0.45 * vel), tau: tb.modTau },
      body: {
        level: a.body ?? tb.body,
        ratio: a.bodyRatio ?? tb.bodyRatio,
        type: a.bodyWave ?? tb.bodyWave,
        tauMul: 0.55,
      },
    });
  }

  /** Band-passed noise sweeping f0 → f1 over `dur`; swells for `atkFrac` of it, then releases. */
  function whoosh(t: number, dur: number, f0: number, f1: number, level: number, busNode: AudioNode, atkFrac = 0.55, q = 0.9): void {
    const atk = dur * atkFrac;
    const tau = Math.min(0.3, Math.max(0.03, (dur - atk) * 0.6));
    const v = sfxVoice(t, atk + tau * RING + 0.02, busNode, 0, { imp: level * NOISE_LOUDNESS, atk, tau });
    if (!v) return;
    const n = noise(v, t);
    const bp = biquad(v, "bandpass", f0, q);
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = gainNode(v);
    pluck(g.gain, t, atk, level, tau);
    n.connect(bp).connect(g).connect(v.out);
  }

  function click(t: number, freq: number, level: number, tau: number, busNode: AudioNode, q = 1.2): void {
    const v = sfxVoice(t, tau * RING + 0.01, busNode, 0, { imp: level * NOISE_LOUDNESS, atk: 0.001, tau });
    if (!v) return;
    const n = noise(v, t);
    const bp = biquad(v, "bandpass", freq, q);
    const g = gainNode(v);
    pluck(g.gain, t, 0.001, level, tau);
    n.connect(bp).connect(g).connect(v.out);
  }

  function thump(t: number, midi: number, level: number, tau: number): void {
    const f = mtof(midi);
    const v = sfxVoice(t, tau * RING + 0.05, dryBus, 0, { imp: level * 1.3, atk: 0.004, tau });
    if (!v) return;
    const o = osc(v, "sine", f);
    o.frequency.setValueAtTime(f * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const g = gainNode(v);
    pluck(g.gain, t, 0.004, level, tau);
    o.connect(g).connect(v.out);
    // An octave partial so small phone speakers still feel it.
    const o2 = osc(v, "triangle", f * 2);
    const g2 = gainNode(v);
    pluck(g2.gain, t, 0.004, level * 0.3, tau * 0.6);
    o2.connect(g2).connect(v.out);
  }

  /** Soft chord swell (sine/triangle, alternating left/right) through an opening lowpass. */
  function bloom(t: number, notes: readonly number[], level: number, atk: number, tau: number, f0: number, f1: number): void {
    const v = sfxVoice(t, atk + tau * RING, wetBus, 0, { imp: level * Math.sqrt(notes.length), atk, tau });
    if (!v) return;
    const merger = ctx.createChannelMerger(2);
    v.nodes.push(merger);
    notes.forEach((m, i) => {
      const o = osc(v, i % 2 ? "triangle" : "sine", mtof(m));
      o.detune.value = rand(-6, 6);
      o.connect(merger, 0, i % 2);
    });
    const lp = biquad(v, "lowpass", f0, 0.7);
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.exponentialRampToValueAtTime(f1, t + atk + 0.3);
    const g = gainNode(v);
    pluck(g.gain, t, atk, level, tau);
    merger.connect(lp).connect(g).connect(v.out);
  }

  // ---------------------------------------------------------------- bed
  let nextSeg = 0;
  let sparkleAt = 0;

  function schedulePad(seg: Seg, now: number): void {
    const th = seg.th;
    const xf = th.xfade;
    const inStart = Math.max(now + 0.01, seg.start - xf / 2);
    const inEnd = Math.max(seg.start + xf / 2, inStart + xf * 0.8);
    if (lastPad && !lastPad.done) release(lastPad, inStart, inEnd - inStart);
    // Rapid theme / music toggling must not stack up chords: keep at most 3 audible bed voices.
    const audible = pads.filter((p) => p !== shim?.v && !p.done && p.killEnd > now + 0.3);
    for (let i = 0; i + 2 < audible.length; i++) kill(audible[i]!, 0.25);
    const v = makeVoice(pads, inStart, Infinity, padBus, 0, LV.bed * th.pad.level);
    const merger = ctx.createChannelMerger(2);
    v.nodes.push(merger);
    for (const m of seg.chord.pad) {
      for (let side = 0; side < 2; side++) {
        const o = ctx.createOscillator();
        o.type = th.pad.waves[side] ?? "sawtooth";
        o.frequency.value = mtof(m);
        o.detune.value = (side === 0 ? -1 : 1) * th.pad.detune + rand(-1.5, 1.5);
        o.connect(merger, 0, side);
        o.start(inStart);
        addSrc(v, o);
      }
    }
    const sub = osc(v, "sine", mtof(seg.chord.root), inStart);
    const subG = gainNode(v, th.pad.sub);
    sub.connect(subG);
    const filt = biquad(v, "lowpass", cutoff(th, intensityAt(now)), th.pad.q);
    glide(filt.frequency, cutoff(th, iTo), now, I_TAU);
    lfoDepth.connect(filt.detune);
    v.cleanup = () => {
      try {
        lfoDepth.disconnect(filt.detune);
      } catch {
        /* already gone */
      }
    };
    const env = gainNode(v, 0);
    env.gain.setValueCurveAtTime(FADE_IN, inStart, inEnd - inStart);
    merger.connect(filt);
    subG.connect(filt);
    filt.connect(env).connect(v.out);
    v.seg = seg;
    v.env = env;
    v.filter = filt;
    v.inEnd = inEnd;
    v.released = false;
    lastPad = v;
    retuneShimmer(seg.chord, Math.max(now, seg.start));
  }

  /** Scheduled end of a bed chord: equal-power fade on its envelope, then stop. */
  function release(v: Voice, at: number, dur: number): void {
    if (v.released || !v.env || v.killEnd !== Infinity) return;
    v.released = true;
    const start = Math.max(at, (v.inEnd ?? 0) + 0.001, ctx.currentTime + 0.005);
    try {
      v.env.gain.setValueCurveAtTime(FADE_OUT, start, dur);
      stopSources(v, start + dur + 0.05);
    } catch {
      kill(v, dur);
    }
  }

  function shimmerNotes(ch: ChordDef): number[] {
    const l = ladder(ch, 83, 4);
    return [l[0] ?? 84, l[2] ?? 91];
  }

  function startShimmer(seg: Seg, at: number): void {
    if (shim && !shim.v.done && shim.v.killEnd === Infinity) return;
    const v = makeVoice(pads, at, Infinity, shimBus, 0, 1);
    const merger = ctx.createChannelMerger(2);
    v.nodes.push(merger);
    const oscs: OscillatorNode[] = [];
    for (const m of shimmerNotes(seg.chord)) {
      for (let side = 0; side < 2; side++) {
        const o = osc(v, "sine", mtof(m), at);
        o.detune.value = side === 0 ? -5 : 5;
        o.connect(merger, 0, side);
        oscs.push(o);
      }
    }
    merger.connect(v.out);
    shim = { v, oscs };
  }

  function retuneShimmer(ch: ChordDef, at: number): void {
    if (!shim || shim.v.done) return;
    const notes = shimmerNotes(ch);
    shim.oscs.forEach((o, i) => {
      o.frequency.cancelScheduledValues(at);
      o.frequency.setTargetAtTime(mtof(notes[i >> 1] ?? 84), at, 0.25);
    });
  }

  function maybeSparkle(at: number): void {
    const x = intensityAt(at);
    const p = SPARKLE_P * smoothstep(0.3, 1, x);
    if (p <= 0 || rng() >= p) return;
    const seg = segmentAt(at);
    const l = ladder(seg.chord, seg.th.floor + 17, 7);
    const m = l[Math.floor(rng() * l.length)];
    if (m === undefined) return;
    const t = at + rand(0, 0.05);
    const args: BellArgs = {
      midi: m,
      t,
      vel: rand(0.55, 1),
      pan: rand(-0.75, 0.75),
      bus: fxBus,
      level: LV.sparkle * (0.6 + 0.4 * x),
      timbre: { ratio: 2, index: 0.5, modTau: 0.08 },
      body: 0,
      tauMul: 0.9,
    };
    bell(args);
    if (x > 0.75 && rng() < 0.3) {
      const up = l[Math.min(l.length - 1, l.indexOf(m) + 2)] ?? m;
      bell({ ...args, midi: up, t: t + 0.125, vel: args.vel * 0.7, pan: -(args.pan ?? 0) });
    }
  }

  function pump(): void {
    if (disposed) return;
    const now = ctx.currentTime;
    prune(voices, now);
    prune(pads, now);
    while (anchors.length > 1 && anchors[1]!.t <= now) anchors.shift();
    if (!playing) return;
    for (let guard = 0; nextSeg < now + LOOKAHEAD && guard < 6; guard++) {
      const seg = segmentAt(Math.max(nextSeg, now) + 1e-3);
      schedulePad(seg, now);
      nextSeg = seg.end;
    }
    if (sparkleAt < now) sparkleAt = now + rand(0, SPARKLE_STEP);
    while (sparkleAt < now + SPARKLE_AHEAD) {
      maybeSparkle(sparkleAt);
      sparkleAt += SPARKLE_STEP;
    }
  }

  function updatePlaying(): void {
    const want = musicWanted && settings.music && !disposed;
    if (want === playing) return;
    const now = ctx.currentTime;
    playing = want;
    if (want) {
      const seg = segmentAt(now);
      setAnchor(now, seg.idx, theme); // give the current chord a full turn
      nextSeg = now;
      sparkleAt = now + 0.5;
      lastPad = null;
      startShimmer(segmentAt(now), now);
      pump();
    } else {
      for (const v of [...pads]) kill(v, STOP_FADE);
      lastPad = null;
      shim = null;
    }
  }

  // ---------------------------------------------------------------- crowd control
  let dens = 0;
  let densT = 0;
  /** Gain for a new event given recent event density; isolated events get 1. */
  function crowd(weight: number): number {
    const now = ctx.currentTime;
    dens *= Math.exp(-Math.max(0, now - densT) / 0.6);
    densT = now;
    const g = 1 / (1 + Math.max(0, dens - 2.5) * 0.25);
    dens += weight;
    return g;
  }

  const sfxOn = (): boolean => settings.sfx && settings.volume > 0;
  const nowT = (): number => ctx.currentTime + LAT;

  // ---------------------------------------------------------------- public API
  const api: Omit<Synth, "context"> = {
    unlock(): void {
      if (isOffline) return;
      const live = ctx as AudioContext;
      if (live.state !== "running" && typeof live.resume === "function") void live.resume().catch(noop);
    },

    setSettings(s: Partial<AudioSettings>): void {
      const now = ctx.currentTime;
      if (typeof s.sfx === "boolean") settings.sfx = s.sfx;
      if (typeof s.music === "boolean") settings.music = s.music;
      if (finite(s.volume)) settings.volume = clamp(s.volume, 0, 1);
      glide(master.gain, volumeGain(settings.volume), now, 0.04);
      const gate = settings.sfx ? 1 : 0;
      glide(dryBus.gain, gate, now, 0.03);
      glide(wetBus.gain, gate, now, 0.03);
      updatePlaying();
    },

    setTheme(t: AudioTheme): void {
      if (!isTheme(t) || THEMES[t] === theme) return;
      theme = THEMES[t];
      const now = ctx.currentTime;
      glide(lfo.frequency, theme.pad.lfoRate, now, 1);
      glide(lfoDepth.gain, theme.pad.lfoDepth, now, 1);
      setAnchor(now, 0, theme);
      if (playing) {
        for (const v of [...pads]) if (v !== shim?.v) kill(v, theme.xfade);
        lastPad = null;
        nextSeg = now;
        retuneShimmer(theme.chords[0]!, now);
        pump();
      }
    },

    startMusic(): void {
      musicWanted = true;
      updatePlaying();
    },

    stopMusic(): void {
      musicWanted = false;
      updatePlaying();
    },

    setIntensity(x: number): void {
      if (!finite(x)) return;
      const now = ctx.currentTime;
      iFrom = intensityAt(now);
      iTo = clamp(x, 0, 1);
      iT0 = now;
      for (const v of pads) if (v.filter && v.seg) glide(v.filter.frequency, cutoff(v.seg.th, iTo), now, I_TAU);
      glide(shimBus.gain, shimLevel(iTo), now, I_TAU);
    },

    place(digit: number, o?: { pan?: number; velocity?: number }): void {
      if (!sfxOn() || !finite(digit)) return;
      const t = nowT();
      const midi = digitNote(theme, segmentAt(t).chord, digit);
      const vel = clamp((finite(o?.velocity) ? o.velocity : 0.8) * rand(0.93, 1.07), 0.05, 1);
      const pan = clamp(finite(o?.pan) ? o.pan : 0, -1, 1) * 0.8 + rand(-0.05, 0.05);
      bell({ midi, t, vel, pan, level: LV.place * crowd(1) });
    },

    note(digit: number, on: boolean): void {
      if (!sfxOn() || !finite(digit)) return;
      const t = nowT();
      const m = digitNote(theme, segmentAt(t).chord, digit);
      const g = crowd(0.2);
      if (on) {
        tone({ t, midi: m + 12, level: LV.noteOn * g, tau: 0.026, atk: 0.0015, fm: { ratio: 4, index: 0.25, tau: 0.01 }, pan: rand(-0.1, 0.1) });
      } else {
        tone({ t, midi: m, level: LV.noteOff * g, tau: 0.02, atk: 0.0015, glide: 0.94, glideTime: 0.05 });
      }
    },

    erase(): void {
      if (!sfxOn()) return;
      const t = nowT();
      const l = ladder(segmentAt(t).chord, theme.floor, 9);
      const g = crowd(0.5);
      whoosh(t, 0.16, 2600, 480, LV.eraseNoise * g, dryBus, 0.25, 1.1);
      tone({ t, midi: (l[3] ?? 67) + 12, level: LV.erase * g, tau: 0.06, glide: Math.pow(2, -5 / 12), glideTime: 0.12 });
    },

    complete(kinds: string[]): void {
      if (!sfxOn() || !Array.isArray(kinds) || kinds.length === 0) return;
      const n = Math.min(4, kinds.length);
      const t = nowT();
      const seg = segmentAt(t);
      const ch = seg.chord;
      const g = crowd(1 + 0.6 * n);
      const l = ladder(ch, theme.floor - 3, 26);
      const off = KIND_OFFSET[String(kinds[0])] ?? 0;
      const steps = [5, 7, 9, 11][n - 1] ?? 5;
      const gap = [0.065, 0.06, 0.055, 0.05][n - 1] ?? 0.06;
      const top = (i: number): number => l[Math.min(l.length - 1, off + i)] ?? theme.floor + 12;
      for (let i = 0; i < steps; i++) {
        const ti = t + i * gap;
        const frac = i / (steps - 1);
        const vel = 0.62 + 0.3 * frac;
        const pan = frac * 1.2 - 0.6;
        // More notes overlap at bigger combos, so each one is a little softer: they grow in size, not just level.
        const lvl = LV.arp * (1.1 - 0.1 * n) * g;
        bell({ midi: top(i), t: ti, vel, pan, level: lvl, body: 0.12, tauMul: 0.85 + 0.12 * n });
        if (n >= 2 && i % 2 === 0) {
          bell({ midi: top(i) + 12, t: ti + 0.012, vel: vel * 0.6, pan: -pan, level: lvl * 0.55, body: 0, tauMul: 0.8 + 0.1 * n });
        }
      }
      const arpEnd = t + (steps - 1) * gap;
      whoosh(t, 0.32 + 0.14 * n, 420, 3200 + 1300 * n, LV.whoosh * (1 + 0.3 * (n - 1)) * g, wetBus);
      thump(t, ch.root + 12, LV.thump * (0.85 + 0.15 * n) * g, 0.09 + 0.03 * n);
      if (n >= 2) bloom(t + 0.02, ch.pad.slice(1).map((m) => m + 12), LV.bloom * g, 0.1, 0.35 + 0.22 * n, 600, 3600);
      if (n >= 3) {
        for (let k = 0; k < n - 1; k++) {
          bell({
            midi: top(steps + 1 + k * 2),
            t: arpEnd + 0.09 + k * 0.11,
            vel: 0.7,
            pan: k % 2 ? 0.5 : -0.5,
            level: LV.crown * g,
            timbre: { ratio: 2, index: 0.6, modTau: 0.1 },
            body: 0,
            tauMul: 1.3,
          });
        }
      }
    },

    solved(): void {
      const t = nowT();
      const tR = t + RES_DELAY;
      const seg = segmentAt(t);
      const cur = seg.chord;
      const tonic = theme.chords[0]!;
      // The bed breathes out under the swell, then lands on the tonic with the resolution.
      setAnchor(seg.start, seg.idx, seg.th, true);
      setAnchor(tR, 0, theme);
      if (playing) {
        const now = ctx.currentTime;
        for (const v of [...pads]) {
          if (v === shim?.v) continue;
          if ((v.seg?.start ?? 0) > now + 0.01) kill(v, 0.3);
          else kill(v, RES_DELAY + 0.4);
        }
        lastPad = null;
        nextSeg = tR;
        retuneShimmer(tonic, tR);
        pump();
      }
      if (!sfxOn()) return;
      const g = crowd(4);
      // 1. Swell: noise riser and the current chord blooming up under it.
      whoosh(t, RES_DELAY - 0.05, 220, 7000, LV.riser * g, wetBus, 0.97, 1);
      bloom(t, cur.pad.map((m) => m + 12), LV.swell * g, RES_DELAY - 0.1, 0.3, 350, 3800);
      // 2. Cascade: 14 rising notes, accelerating into the downbeat.
      const l = ladder(cur, theme.floor - 5, 20);
      const count = 14;
      const span = RES_DELAY - 0.22;
      const weights = Array.from({ length: count - 1 }, (_, i) => Math.pow(0.9, i));
      const wsum = weights.reduce((s, w) => s + w, 0);
      let tc = t + 0.1;
      for (let i = 0; i < count; i++) {
        const frac = i / (count - 1);
        bell({
          midi: l[i] ?? theme.floor + 24,
          t: tc,
          vel: 0.5 + 0.38 * frac,
          pan: Math.sin(i * 1.3) * 0.6,
          level: LV.cascade * g,
          body: 0.1,
          tauMul: 0.9,
        });
        tc += ((weights[i] ?? 0) / wsum) * span;
      }
      // 3. Resolution: strummed tonic chord, long bloom, sub thump.
      const lt = ladder(tonic, theme.floor - 5, 24);
      [0, 2, 4, 6, 8, 10].forEach((k, i) => {
        bell({
          midi: lt[k] ?? theme.floor + k,
          t: tR + i * 0.028,
          vel: 0.82,
          pan: (i / 5) * 1.2 - 0.6,
          level: LV.resolve * g,
          tauMul: 1.8,
          body: 0.3,
        });
      });
      bloom(tR, tonic.pad.map((m) => m + 12), LV.resolveBloom * g, 0.06, 1.3, 900, 4200);
      thump(tR, tonic.root + 12, LV.thump * 0.9 * g, 0.25);
      // 4. Sparkle shower on the tonic's upper notes.
      for (let k = 0; k < 5; k++) {
        bell({
          midi: lt[12 + ((k * 3) % 7)] ?? theme.floor + 30,
          t: tR + 0.35 + k * 0.32 + rand(0, 0.05),
          vel: 0.6,
          pan: rand(-0.7, 0.7),
          level: LV.shower * g,
          timbre: { ratio: 2, index: 0.55, modTau: 0.09 },
          body: 0,
          tauMul: 1.4,
        });
      }
    },

    mistake(): void {
      if (!sfxOn()) return;
      const t = nowT();
      const ch = segmentAt(t).chord;
      const g = crowd(1);
      // Muted, beating thud: root + minor second, lowpassed.
      const f0 = mtof(ch.root + 12);
      const v = sfxVoice(t, 0.005 + 0.1 * RING + 0.05, dryBus, 0, { imp: LV.thud * g, atk: 0.005, tau: 0.1 });
      if (v) {
        const lp = biquad(v, "lowpass", 420, 0.7);
        const amp = gainNode(v);
        pluck(amp.gain, t, 0.005, LV.thud * g, 0.1);
        lp.connect(amp).connect(v.out);
        const parts: [number, OscillatorType, number][] = [
          [1, "sine", 1],
          [Math.pow(2, 1 / 12), "sine", 0.7],
          [2, "triangle", 0.35],
        ];
        for (const [ratio, type, lvl] of parts) {
          const o = osc(v, type, f0 * ratio);
          o.frequency.setValueAtTime(f0 * ratio * 1.4, t);
          o.frequency.exponentialRampToValueAtTime(f0 * ratio, t + 0.06);
          const pg = gainNode(v, lvl);
          o.connect(pg).connect(lp);
        }
      }
      // Glitchy blip: a soft square stuttering down, a semitone off a chord tone.
      const l = ladder(ch, theme.floor, 9);
      const t1 = t + 0.055;
      const b = sfxVoice(t1, 0.14, dryBus, rand(-0.3, 0.3), { imp: LV.glitch * g, atk: 0.002, tau: 0.03 });
      if (b) {
        const f = mtof((l[5] ?? 74) - 1);
        const o = osc(b, "square", f, t1);
        const lp = biquad(b, "lowpass", 1700, 1.2);
        const gate = gainNode(b);
        for (let k = 0; k < 3; k++) {
          const s = t1 + k * 0.032;
          o.frequency.setValueAtTime(f * Math.pow(0.94, k), s);
          gate.gain.setValueAtTime(0, s);
          gate.gain.linearRampToValueAtTime(LV.glitch * g * (1 - 0.2 * k), s + 0.002);
          gate.gain.setValueAtTime(LV.glitch * g * (1 - 0.2 * k), s + 0.017);
          gate.gain.linearRampToValueAtTime(0, s + 0.02);
        }
        o.connect(lp).connect(gate).connect(b.out);
      }
    },

    hint(rung: number): void {
      if (!sfxOn()) return;
      const r = clamp(finite(rung) ? Math.round(rung) : 0, 0, 4);
      const t = nowT();
      const l = ladder(segmentAt(t).chord, theme.floor, 18);
      const g = crowd(0.8);
      const count = [2, 2, 3, 3, 3][r] ?? 2;
      for (let i = 0; i < count; i++) {
        tone({
          t: t + i * 0.085,
          midi: l[2 + r + 2 * i] ?? theme.floor + 12,
          level: (LV.hint + 0.003 * r) * g,
          tau: 0.34 + 0.03 * r,
          fm: { ratio: 2, index: 0.35 + 0.15 * r, tau: 0.15 },
          body: { level: 0.18, ratio: 3, type: "sine", tauMul: 0.5 },
          bus: wetBus,
          pan: -0.3 + 0.2 * i,
        });
      }
    },

    queen(col: number, n: number): void {
      if (!sfxOn() || !finite(col) || !finite(n)) return;
      const t = nowT();
      const l = ladder(segmentAt(t).chord, theme.floor, 9);
      const idx = spreadIndex(col, n);
      const pan = n > 1 ? (clamp(col, 0, n - 1) / (n - 1)) * 1.2 - 0.6 : 0;
      bell({
        midi: l[idx] ?? theme.floor + 7,
        t,
        vel: 0.85,
        pan,
        level: LV.queen * crowd(1),
        tauMul: 1.3,
        body: 0.32,
        bodyRatio: 0.5,
        bodyWave: "triangle",
      });
    },

    cross(): void {
      if (!sfxOn()) return;
      const t = nowT();
      const l = ladder(segmentAt(t).chord, theme.floor, 9);
      const g = crowd(0.2);
      click(t, 4200, LV.cross * g, 0.009, dryBus, 1.5);
      tone({ t, midi: (l[8] ?? 84) + 12, level: LV.cross * 0.3 * g, tau: 0.012, atk: 0.001 });
    },

    ui(kind: UiSound): void {
      if (!sfxOn()) return;
      const t = nowT();
      const l = ladder(segmentAt(t).chord, theme.floor, 12);
      const n = (i: number): number => (l[i] ?? theme.floor + 2 * i) + 12;
      const g = crowd(0.15);
      switch (kind) {
        case "select":
          tone({ t, midi: n(6), level: LV.select * g, tau: 0.014, atk: 0.002 });
          break;
        case "tap":
          tone({ t, midi: n(4), level: LV.tap * g, tau: 0.035, type: "triangle" });
          click(t, 3000, LV.tap * 0.35 * g, 0.004, dryBus);
          break;
        case "open":
        case "close": {
          const seq = kind === "open" ? [n(4), n(6)] : [n(6), n(4)];
          seq.forEach((m, i) =>
            tone({ t: t + i * 0.055, midi: m, level: LV.open * g, tau: 0.12, fm: { ratio: 2, index: 0.3, tau: 0.08 }, bus: wetBus, pan: i ? 0.15 : -0.15 }),
          );
          whoosh(t, 0.18, kind === "open" ? 900 : 3200, kind === "open" ? 3200 : 900, LV.open * 0.3 * g, wetBus, 0.5, 1);
          break;
        }
        case "toggle":
          tone({ t, midi: n(5), level: LV.toggle * g, tau: 0.025, type: "triangle" });
          tone({ t: t + 0.03, midi: n(7), level: LV.toggle * g, tau: 0.025, type: "triangle" });
          break;
        default:
          break;
      }
    },

    tick(): void {
      pump();
    },

    setFocus(focused: boolean): void {
      const now = ctx.currentTime;
      glide(focus.gain, focused ? 1 : 0, now, focused ? 0.15 : 0.08);
    },

    stats(): SynthStats {
      const now = ctx.currentTime;
      const live = (v: Voice): boolean => !v.done && v.end > now;
      return {
        voices: voices.filter(live).length,
        sounding: voices.filter((v) => live(v) && v.t0 <= now).length,
        padVoices: pads.filter((v) => live(v) && v !== shim?.v).length,
        theme: theme.id,
        chord: segmentAt(now).chord.name,
        intensity: intensityAt(now),
        musicPlaying: playing,
      };
    },

    dispose(): void {
      const now = ctx.currentTime;
      for (const v of [...voices, ...pads]) kill(v, 0.02);
      playing = false;
      disposed = true;
      try {
        lfo.stop(now + 0.05);
      } catch {
        /* never started */
      }
      clip.disconnect();
    },
  };

  /** Wrap every method: never throw into the game, and keep the bed scheduler fed. */
  const guarded = {} as Record<string, unknown>;
  for (const [name, fn] of Object.entries(api) as [string, (...a: unknown[]) => unknown][]) {
    guarded[name] = (...args: unknown[]): unknown => {
      if (disposed) return name === "stats" ? fn() : undefined;
      try {
        if (name !== "tick" && name !== "stats" && name !== "dispose") pump();
        return fn(...args);
      } catch {
        return name === "stats" ? silentSynth(ctx).stats() : undefined;
      }
    };
  }
  return { context: ctx, ...(guarded as unknown as Omit<Synth, "context">) };
}

// -------------------------------------------------------------------- lazy singleton

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  if (typeof g.AudioContext === "function") return g.AudioContext;
  if (typeof g.webkitAudioContext === "function") return g.webkitAudioContext;
  return null;
}

const pageHidden = (): boolean => typeof document !== "undefined" && document.visibilityState === "hidden";

/**
 * The app-facing engine: remembers settings/theme/intensity/music until the first `unlock()`
 * (a user gesture), then creates the AudioContext and a synth, drives its scheduler, and follows
 * page visibility. Every method is a silent no-op when Web Audio is unavailable.
 */
class LazyEngine implements SoundEngine {
  private ctx: AudioContext | null = null;
  private synth: Synth | null = null;
  private dead = false;
  private primed = false;
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  private theme: AudioTheme = "abyss";
  private intensity = 0;
  private music = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  unlock(): void {
    try {
      if (this.dead) return;
      if (!this.ctx && !this.boot()) return;
      const ctx = this.ctx;
      if (!ctx) return;
      if (ctx.state !== "running" && !pageHidden()) void ctx.resume().catch(noop);
      if (!this.primed) {
        // iOS: a (silent) buffer started inside the gesture fully unlocks output.
        this.primed = true;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(ctx.destination);
        src.start(0);
      }
    } catch {
      /* never throw from a pointer handler */
    }
  }

  private boot(): boolean {
    const Ctor = audioContextCtor();
    if (!Ctor) {
      this.dead = true;
      return false;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      try {
        ctx = new Ctor();
      } catch {
        this.dead = true;
        return false;
      }
    }
    this.ctx = ctx;
    const s = createSynth(ctx);
    s.setSettings(this.settings);
    s.setTheme(this.theme);
    s.setIntensity(this.intensity);
    if (this.music) s.startMusic();
    this.synth = s;
    setInterval(() => this.synth?.tick(), TICK_MS);
    if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    return true;
  }

  private readonly onVisibility = (): void => {
    try {
      const ctx = this.ctx;
      const s = this.synth;
      if (!ctx || !s) return;
      if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
      if (pageHidden()) {
        s.setFocus(false);
        this.suspendTimer = setTimeout(() => {
          this.suspendTimer = null;
          if (pageHidden() && ctx.state === "running") void ctx.suspend().catch(noop);
        }, 350);
      } else {
        if (ctx.state !== "running") void ctx.resume().catch(noop);
        s.setFocus(true);
      }
    } catch {
      /* ignore */
    }
  };

  /** Run an effect only when it can actually be heard now (avoids bursts of stale sounds on resume). */
  private fx(fn: (s: Synth) => void): void {
    try {
      const s = this.synth;
      if (!s || !this.ctx || pageHidden()) return;
      const state = this.ctx.state as string;
      if (state === "closed" || state === "interrupted") return;
      fn(s);
    } catch {
      /* ignore */
    }
  }

  private live(fn: (s: Synth) => void): void {
    try {
      if (this.synth) fn(this.synth);
    } catch {
      /* ignore */
    }
  }

  setSettings(s: Partial<AudioSettings>): void {
    try {
      if (typeof s?.sfx === "boolean") this.settings.sfx = s.sfx;
      if (typeof s?.music === "boolean") this.settings.music = s.music;
      if (finite(s?.volume)) this.settings.volume = clamp(s.volume, 0, 1);
    } catch {
      return;
    }
    this.live((x) => x.setSettings(s));
  }
  setTheme(t: AudioTheme): void {
    if (!isTheme(t)) return;
    this.theme = t;
    this.live((x) => x.setTheme(t));
  }
  startMusic(): void {
    this.music = true;
    this.live((x) => x.startMusic());
  }
  stopMusic(): void {
    this.music = false;
    this.live((x) => x.stopMusic());
  }
  setIntensity(x: number): void {
    if (!finite(x)) return;
    this.intensity = clamp(x, 0, 1);
    this.live((s) => s.setIntensity(x));
  }
  place(digit: number, opts?: { pan?: number; velocity?: number }): void {
    this.fx((s) => s.place(digit, opts));
  }
  note(digit: number, on: boolean): void {
    this.fx((s) => s.note(digit, on));
  }
  erase(): void {
    this.fx((s) => s.erase());
  }
  complete(kinds: string[]): void {
    this.fx((s) => s.complete(kinds));
  }
  solved(): void {
    this.fx((s) => s.solved());
  }
  mistake(): void {
    this.fx((s) => s.mistake());
  }
  hint(rung: number): void {
    this.fx((s) => s.hint(rung));
  }
  queen(col: number, n: number): void {
    this.fx((s) => s.queen(col, n));
  }
  cross(): void {
    this.fx((s) => s.cross());
  }
  ui(kind: UiSound): void {
    this.fx((s) => s.ui(kind));
  }
}

/** A fresh lazy engine (the `audio` singleton is one of these). */
export function createAudioEngine(): SoundEngine {
  return new LazyEngine();
}

/** The app's sound engine. Call `audio.unlock()` from the first pointerdown. */
export const audio: SoundEngine = createAudioEngine();
