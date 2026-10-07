/**
 * Music tables for the sound engine: per-theme key/mode, chord progression, pad and bell
 * timbre, plus the pure pitch-mapping helpers. No Web Audio objects live here (only the
 * `OscillatorType` string type), so everything is unit-testable in Node.
 *
 * MIDI numbers throughout: 60 = C4 = 261.63 Hz, 69 = A4 = 440 Hz.
 */

export type AudioTheme = "abyss" | "ember" | "aurora";

export interface ChordDef {
  /** Display name, e.g. "Dm9". */
  readonly name: string;
  /** Sub-bass root (MIDI, octave 1–2). */
  readonly root: number;
  /** Pad voicing (MIDI). */
  readonly pad: readonly number[];
  /**
   * Melody pitch classes (0 = C … 11 = B) that placements, arpeggios and sparkles are
   * quantized to. Every set is chord tones + gentle extensions with no two members a
   * semitone apart, so any note drawn from it is consonant over the pad.
   */
  readonly tones: readonly number[];
}

export interface PadTimbre {
  /** Oscillator shape for the left / right detuned copy of each pad note. */
  readonly waves: readonly [OscillatorType, OscillatorType];
  /** ± detune in cents between the left and right copies. */
  readonly detune: number;
  /** Lowpass cutoff (Hz) at intensity 0 and 1 (interpolated exponentially). */
  readonly cutoffLo: number;
  readonly cutoffHi: number;
  readonly q: number;
  /** Filter LFO rate (Hz) and depth (cents). */
  readonly lfoRate: number;
  readonly lfoDepth: number;
  /** Pad level relative to the engine's bed level (1 = reference), and the sub sine's gain relative to the pad. */
  readonly level: number;
  readonly sub: number;
}

export interface BellTimbre {
  /** FM modulator : carrier frequency ratio. Integer = harmonic (glassy), non-integer = bell-like. */
  readonly ratio: number;
  /** Peak FM index (deviation / modulator frequency) at velocity 1, middle register. */
  readonly index: number;
  /** Time constant (s) of the index decay: how fast the bright attack mellows. */
  readonly modTau: number;
  /** Amplitude decay time constant (s); audible ring ≈ 4 × tau. */
  readonly tau: number;
  /** Level of the soft "body" oscillator relative to the carrier. */
  readonly body: number;
  readonly bodyWave: OscillatorType;
  /** Body frequency ratio to the carrier (1 = unison, 0.5 = octave below, 2 = octave above). */
  readonly bodyRatio: number;
}

export interface ThemeDef {
  readonly id: AudioTheme;
  /** Display description of the key/mode. */
  readonly mode: string;
  /** Seconds per chord. */
  readonly chordDur: number;
  /** Pad crossfade length (s), centred on each chord boundary. */
  readonly xfade: number;
  /** Lowest melody note (MIDI): digit 1 is the first chord tone at or above it. */
  readonly floor: number;
  readonly chords: readonly ChordDef[];
  readonly pad: PadTimbre;
  readonly bell: BellTimbre;
}

const ABYSS: ThemeDef = {
  id: "abyss",
  mode: "D Dorian with a Lydian Bb (cool, deep)",
  chordDur: 9,
  xfade: 3.2,
  floor: 62,
  chords: [
    { name: "Dm9", root: 38, pad: [50, 57, 60, 65, 76], tones: [0, 2, 4, 7, 9] }, // C D E G A over Dm9: open, no 3rd
    { name: "Bbmaj7#11", root: 34, pad: [46, 53, 57, 62, 64], tones: [10, 0, 2, 5, 7] }, // Bb C D F G
    { name: "Fmaj9", root: 41, pad: [53, 57, 60, 64, 67], tones: [5, 7, 9, 0, 2] }, // F G A C D
    { name: "G6/9", root: 43, pad: [55, 59, 62, 64, 69], tones: [7, 9, 11, 2, 4] }, // G A B D E (Dorian IV)
  ],
  pad: {
    waves: ["sawtooth", "triangle"],
    detune: 7,
    cutoffLo: 380,
    cutoffHi: 2300,
    q: 0.8,
    lfoRate: 0.055,
    lfoDepth: 650,
    level: 0.85,
    sub: 0.5,
  },
  bell: { ratio: 3, index: 1.15, modTau: 0.12, tau: 0.34, body: 0.28, bodyWave: "triangle", bodyRatio: 1 },
};

const EMBER: ThemeDef = {
  id: "ember",
  mode: "A minor with an F Lydian colour (warm)",
  chordDur: 8,
  xfade: 3,
  floor: 60,
  chords: [
    { name: "Am9", root: 33, pad: [45, 52, 60, 67, 71], tones: [9, 0, 2, 4, 7] }, // A C D E G (A minor pentatonic)
    { name: "Fmaj7#11", root: 41, pad: [41, 48, 57, 64, 71], tones: [5, 7, 9, 11, 2] }, // F G A B D (Lydian)
    { name: "Dm9", root: 38, pad: [50, 53, 60, 64, 69], tones: [2, 5, 7, 9, 0] }, // D F G A C
    { name: "Em7(11)", root: 40, pad: [52, 59, 62, 67, 69], tones: [4, 7, 9, 11, 2] }, // E G A B D
  ],
  pad: {
    waves: ["sawtooth", "sawtooth"],
    detune: 6,
    cutoffLo: 460,
    cutoffHi: 2600,
    q: 1.4,
    lfoRate: 0.07,
    lfoDepth: 520,
    level: 0.98,
    sub: 0.55,
  },
  // Soft mallet: harmonic 4:1 partial that dies fast, strong triangle body, shorter ring.
  bell: { ratio: 4, index: 0.9, modTau: 0.05, tau: 0.27, body: 0.42, bodyWave: "triangle", bodyRatio: 1 },
};

const AURORA: ThemeDef = {
  id: "aurora",
  mode: "E major pentatonic (airy)",
  chordDur: 7.5,
  xfade: 3,
  floor: 64,
  chords: [
    { name: "E6/9", root: 40, pad: [52, 59, 61, 66, 68], tones: [4, 6, 8, 11, 1] }, // E F# G# B C#
    { name: "C#m7", root: 37, pad: [49, 56, 59, 64, 68], tones: [1, 4, 8, 11] }, // C# E G# B
    { name: "Amaj9", root: 33, pad: [45, 52, 56, 59, 61], tones: [9, 11, 1, 4, 6] }, // A B C# E F#
    { name: "Bsus(add9)", root: 35, pad: [47, 54, 59, 61, 64], tones: [11, 1, 4, 6] }, // B C# E F#
  ],
  pad: {
    waves: ["triangle", "sawtooth"],
    detune: 9,
    cutoffLo: 700,
    cutoffHi: 3800,
    q: 0.6,
    lfoRate: 0.045,
    lfoDepth: 450,
    level: 1.05,
    sub: 0.45,
  },
  // Airy chime: inharmonic 3.5:1 partial, sine body an octave up, longest ring.
  bell: { ratio: 3.5, index: 1.05, modTau: 0.16, tau: 0.4, body: 0.16, bodyWave: "sine", bodyRatio: 2 },
};

export const THEMES: Readonly<Record<AudioTheme, ThemeDef>> = { abyss: ABYSS, ember: EMBER, aurora: AURORA };

export function isTheme(x: unknown): x is AudioTheme {
  return x === "abyss" || x === "ember" || x === "aurora";
}

/** MIDI note → frequency (Hz). */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Pitch class 0..11 of a MIDI note. */
export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

/** `count` ascending MIDI notes whose pitch class is in the chord's melody set, starting at `floor`. */
export function ladder(chord: ChordDef, floor: number, count: number): number[] {
  const out: number[] = [];
  for (let m = Math.round(floor); out.length < count && m < floor + 128; m++) {
    if (chord.tones.includes(pitchClass(m))) out.push(m);
  }
  return out;
}

/** Digit 1..9 → MIDI note on the chord's ladder (higher digit → higher note). Out-of-range digits clamp. */
export function digitNote(theme: ThemeDef, chord: ChordDef, digit: number): number {
  const d = Math.min(9, Math.max(1, Math.round(digit)));
  const notes = ladder(chord, theme.floor, 9);
  return notes[d - 1] ?? theme.floor;
}

/** Spread position `i` of `n` (e.g. a board column) evenly over ladder steps 0..steps-1. */
export function spreadIndex(i: number, n: number, steps = 9): number {
  if (!(n > 1)) return Math.floor((steps - 1) / 2);
  const c = Math.min(n - 1, Math.max(0, Math.round(i)));
  return Math.round((c / (n - 1)) * (steps - 1));
}
