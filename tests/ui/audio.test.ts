import { mulberry32 } from "../../src/engine/rng";
import {
  CLIP_CEIL,
  CLIP_KNEE,
  FADE_IN,
  FADE_OUT,
  impulseResponse,
  softClip,
  softClipCurve,
  volumeGain,
  whiteNoise,
} from "../../src/ui/audio/dsp";
import { audio, createAudioEngine, createSynth, type SoundEngine } from "../../src/ui/audio/synth";
import { THEMES, digitNote, ladder, mtof, pitchClass, spreadIndex } from "../../src/ui/audio/theory";

/** Call every method, including with junk arguments. */
function exercise(e: SoundEngine): void {
  e.setSettings({ sfx: true, music: true, volume: 0.6 });
  e.setSettings({ volume: Number.NaN });
  e.setTheme("aurora");
  e.setTheme("nope" as never);
  e.startMusic();
  e.setIntensity(0.7);
  e.setIntensity(Number.NaN);
  for (let d = -1; d <= 10; d++) e.place(d, { pan: d / 5 - 1, velocity: d / 9 });
  e.place(Number.NaN);
  e.note(4, true);
  e.note(4, false);
  e.erase();
  e.complete(["row"]);
  e.complete(["row", "col", "box", "cage", "region", "digit", "???"]);
  e.complete([]);
  e.solved();
  e.mistake();
  for (let r = -1; r <= 5; r++) e.hint(r);
  e.queen(0, 8);
  e.queen(7, 8);
  e.queen(3, 0);
  e.cross();
  for (const k of ["tap", "open", "close", "toggle", "select"] as const) e.ui(k);
  e.ui("bogus" as never);
  e.stopMusic();
}

const g = globalThis as Record<string, unknown>;

describe("audio engine without Web Audio (Node)", () => {
  it("really has no AudioContext here", () => {
    expect(g.AudioContext).toBeUndefined();
    expect(g.webkitAudioContext).toBeUndefined();
  });

  it("singleton: every method is a silent no-op before and after unlock()", () => {
    expect(() => exercise(audio)).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
    expect(() => exercise(audio)).not.toThrow();
  });

  it("a fresh engine behaves the same", () => {
    const e = createAudioEngine();
    expect(() => {
      exercise(e);
      e.unlock();
      exercise(e);
    }).not.toThrow();
  });

  it("survives an AudioContext constructor that throws (e.g. blocked by the browser)", () => {
    g.AudioContext = class {
      constructor() {
        throw new Error("blocked");
      }
    };
    try {
      const e = createAudioEngine();
      expect(() => {
        e.unlock();
        e.unlock();
        exercise(e);
      }).not.toThrow();
    } finally {
      delete g.AudioContext;
    }
  });

  it("survives a half-broken AudioContext implementation", () => {
    vi.useFakeTimers();
    g.AudioContext = class {
      state = "suspended";
      sampleRate = 44100;
      currentTime = 0;
    };
    try {
      const e = createAudioEngine();
      expect(() => {
        exercise(e);
        e.unlock();
        exercise(e);
        vi.advanceTimersByTime(1000);
      }).not.toThrow();
    } finally {
      delete g.AudioContext;
      vi.useRealTimers();
    }
  });

  it("createSynth on an unusable context returns a silent synth", () => {
    const s = createSynth({} as unknown as BaseAudioContext);
    expect(() => {
      exercise(s);
      s.tick();
      s.setFocus(false);
      s.dispose();
    }).not.toThrow();
    expect(s.stats().voices).toBe(0);
  });
});

describe("pitch mapping", () => {
  const all = Object.values(THEMES).flatMap((theme) => theme.chords.map((chord) => ({ theme, chord })));

  it("mtof uses A4 = 440 Hz", () => {
    expect(mtof(69)).toBeCloseTo(440, 6);
    expect(mtof(60)).toBeCloseTo(261.626, 2);
    expect(mtof(81)).toBeCloseTo(880, 6);
  });

  it("digits 1..9 climb the current chord's tones over about two octaves", () => {
    for (const { theme, chord } of all) {
      const notes = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => digitNote(theme, chord, d));
      for (let i = 1; i < notes.length; i++) expect(notes[i]! - notes[i - 1]!).toBeGreaterThanOrEqual(2);
      for (const m of notes) expect(chord.tones).toContain(pitchClass(m));
      expect(notes[0]!).toBeGreaterThanOrEqual(theme.floor);
      const span = notes[8]! - notes[0]!;
      expect(span).toBeGreaterThanOrEqual(17);
      expect(span).toBeLessThanOrEqual(26);
    }
  });

  it("out-of-range digits clamp to 1..9", () => {
    const { theme, chord } = all[0]!;
    expect(digitNote(theme, chord, 0)).toBe(digitNote(theme, chord, 1));
    expect(digitNote(theme, chord, 42)).toBe(digitNote(theme, chord, 9));
    expect(digitNote(theme, chord, 4.6)).toBe(digitNote(theme, chord, 5));
  });

  it("melody sets have no semitone neighbours and never rub against the chord root", () => {
    for (const { chord } of all) {
      const pcs = [...chord.tones].sort((a, b) => a - b);
      for (let i = 0; i < pcs.length; i++) {
        const next = i + 1 < pcs.length ? pcs[i + 1]! : pcs[0]! + 12;
        expect(next - pcs[i]!, `${chord.name}: ${pcs.join(",")}`).toBeGreaterThanOrEqual(2);
      }
      const root = pitchClass(chord.root);
      expect(chord.tones).not.toContain((root + 1) % 12);
      expect(chord.tones).not.toContain((root + 11) % 12);
    }
  });

  it("every pad voicing contains its root, and each theme starts on its tonic", () => {
    for (const { chord } of all) expect(chord.pad.map(pitchClass)).toContain(pitchClass(chord.root));
    expect(THEMES.abyss.chords[0]!.name).toBe("Dm9");
    expect(THEMES.ember.chords[0]!.name).toBe("Am9");
    expect(THEMES.aurora.chords[0]!.name).toBe("E6/9");
  });

  it("ladders ascend from the floor", () => {
    const l = ladder(THEMES.abyss.chords[0]!, 62, 12);
    expect(l).toHaveLength(12);
    expect(l[0]).toBe(62);
    for (let i = 1; i < l.length; i++) expect(l[i]!).toBeGreaterThan(l[i - 1]!);
  });

  it("queen columns spread evenly over the ladder", () => {
    expect(spreadIndex(0, 8)).toBe(0);
    expect(spreadIndex(7, 8)).toBe(8);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((c) => spreadIndex(c, 8))).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
    expect(spreadIndex(0, 1)).toBe(4);
    expect(spreadIndex(3, 0)).toBe(4);
    expect(spreadIndex(99, 5)).toBe(8);
  });
});

describe("dsp building blocks", () => {
  it("soft clip is transparent below the knee and never reaches full scale", () => {
    for (const x of [0, 0.1, -0.5, 0.88, -0.88]) expect(softClip(x)).toBeCloseTo(x, 12);
    expect(softClip(1)).toBeLessThan(1);
    expect(Math.abs(softClip(-100))).toBeLessThanOrEqual(CLIP_CEIL);
    let prev = -Infinity;
    for (let x = -4; x <= 4; x += 0.01) {
      const y = softClip(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(softClip(-x)).toBeCloseTo(-y, 12);
      prev = y;
    }
    const curve = softClipCurve();
    expect(curve.length % 2).toBe(1);
    expect(curve[(curve.length - 1) / 2]).toBe(0);
    expect(Math.max(...curve.map(Math.abs))).toBeLessThanOrEqual(Math.fround(CLIP_CEIL));
    expect(CLIP_KNEE).toBeLessThan(CLIP_CEIL);
  });

  it("the reverb impulse has a pre-delay, unit energy, a decaying tail and decorrelated channels", () => {
    const sr = 44100;
    const [l, r] = impulseResponse(sr, 2.9, 0.022, mulberry32(1));
    const pre = Math.round(0.022 * sr);
    expect(l.length).toBe(pre + Math.round(2.9 * sr));
    for (let i = 0; i < pre; i++) expect(l[i]).toBe(0);
    const energy = (d: Float32Array, a = 0, b = d.length): number => {
      let e = 0;
      for (let i = a; i < b; i++) e += (d[i] ?? 0) ** 2;
      return e;
    };
    expect(energy(l)).toBeCloseTo(1, 3);
    expect(energy(r)).toBeCloseTo(1, 3);
    expect(energy(l, l.length - Math.round(0.3 * sr))).toBeLessThan(1e-4);
    let dot = 0;
    for (let i = 0; i < l.length; i++) dot += (l[i] ?? 0) * (r[i] ?? 0);
    expect(Math.abs(dot)).toBeLessThan(0.1);
    expect(l.every(Number.isFinite) && r.every(Number.isFinite)).toBe(true);
  });

  it("white noise is centred and bounded", () => {
    const [n] = whiteNoise(8000, 1, mulberry32(2));
    let sum = 0;
    for (const x of n) {
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(Math.abs(sum / n.length)).toBeLessThan(0.05);
  });

  it("bed crossfades are equal-power", () => {
    expect(FADE_IN[0]).toBe(0);
    expect(FADE_IN[FADE_IN.length - 1]).toBeCloseTo(1, 6);
    expect(FADE_OUT[FADE_OUT.length - 1]).toBeCloseTo(0, 6);
    for (let i = 0; i < FADE_IN.length; i++) expect(FADE_IN[i]! ** 2 + FADE_OUT[i]! ** 2).toBeCloseTo(1, 5);
  });

  it("volume is perceptual and clamped", () => {
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBeCloseTo(0.25, 12);
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(7)).toBe(1);
    expect(volumeGain(-1)).toBe(0);
    expect(volumeGain(Number.NaN)).toBe(0);
  });
});
