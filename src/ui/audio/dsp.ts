/**
 * Small DSP building blocks for the sound engine. The buffer generators are pure (they return
 * Float32Arrays) and run once per AudioContext, never per audio sample at playback time.
 */
import type { Rng } from "../../engine/rng";

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** Master volume 0..1 → gain (perceptual: volume²). Non-numbers count as 0. */
export const volumeGain = (v: number): number => {
  const x = clamp(finite(v) ? v : 0, 0, 1);
  return x * x;
};

/** Equal-power crossfade shapes (sin/cos quarter waves), for setValueCurveAtTime, which copies them. */
const FADE_N = 48;
export const FADE_IN = new Float32Array(FADE_N).map((_, i) => Math.sin(((i / (FADE_N - 1)) * Math.PI) / 2));
export const FADE_OUT = new Float32Array(FADE_N).map((_, i) => Math.cos(((i / (FADE_N - 1)) * Math.PI) / 2));

/**
 * Safety soft clip for a WaveShaperNode: the identity below `CLIP_KNEE`, then a tanh bend that never
 * exceeds `CLIP_CEIL`. The shaper's input is pre-scaled by 1/CLIP_RANGE, so inputs up to ±4 FS land
 * on the curve (beyond that the shaper holds the end value, still ≤ CLIP_CEIL).
 */
export const CLIP_RANGE = 4;
export const CLIP_KNEE = 0.88;
export const CLIP_CEIL = 0.98;

/** Output of the soft clip for an input sample x (in original units). */
export function softClip(x: number): number {
  const ax = Math.abs(x);
  const y = ax <= CLIP_KNEE ? ax : CLIP_KNEE + (CLIP_CEIL - CLIP_KNEE) * Math.tanh((ax - CLIP_KNEE) / (CLIP_CEIL - CLIP_KNEE));
  return Math.sign(x) * y;
}

let clipCurve: Float32Array<ArrayBuffer> | null = null;
/** The WaveShaper curve for `softClip` over [−CLIP_RANGE, CLIP_RANGE] (built once, shared). */
export function softClipCurve(): Float32Array<ArrayBuffer> {
  if (clipCurve) return clipCurve;
  const n = 4097; // odd, so 0 maps exactly onto the middle point
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = softClip(((i / (n - 1)) * 2 - 1) * CLIP_RANGE);
  clipCurve = c;
  return c;
}

/**
 * Stereo reverb impulse response: decorrelated noise per channel, `preDelay` seconds of silence,
 * a 10 ms fade-in, exponential decay reaching −60 dB at `seconds`, and a one-pole lowpass that
 * closes over time so the tail darkens like a real room. Each channel is normalized to unit energy,
 * so a reverb send of g returns roughly g² of the input's power.
 */
export function impulseResponse(sampleRate: number, seconds: number, preDelay: number, rng: Rng): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const pre = Math.round(preDelay * sampleRate);
  const len = pre + Math.round(seconds * sampleRate);
  const tau = seconds / 6.91; // e^(−6.91) = −60 dB
  const make = (): Float32Array<ArrayBuffer> => {
    const d = new Float32Array(len);
    let lp = 0;
    let energy = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sampleRate;
      const a = Math.min(0.9, 0.2 + 0.3 * t);
      lp += (1 - a) * (rng() * 2 - 1 - lp);
      const x = lp * Math.exp(-t / tau) * Math.min(1, t / 0.01);
      d[i] = x;
      energy += x * x;
    }
    const k = 1 / Math.sqrt(energy || 1);
    for (let i = pre; i < len; i++) d[i] = (d[i] ?? 0) * k;
    return d;
  };
  return [make(), make()];
}

/** Stereo white noise in [−1, 1). */
export function whiteNoise(sampleRate: number, seconds: number, rng: Rng): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const len = Math.round(seconds * sampleRate);
  const make = (): Float32Array<ArrayBuffer> => {
    const d = new Float32Array(len);
    for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
    return d;
  };
  return [make(), make()];
}

/** Copy channel data into a new AudioBuffer of the context. */
export function toAudioBuffer(ctx: BaseAudioContext, channels: readonly Float32Array<ArrayBuffer>[]): AudioBuffer {
  const len = channels[0]?.length ?? 1;
  const buf = ctx.createBuffer(channels.length, len, ctx.sampleRate);
  channels.forEach((d, ch) => buf.getChannelData(ch).set(d));
  return buf;
}

/** Smoothly move an AudioParam. Uses setTarget only, so it can always be interrupted without a jump. */
export function glide(p: AudioParam, value: number, now: number, tau: number): void {
  p.cancelScheduledValues(now);
  p.setTargetAtTime(value, now, tau);
}

/** Percussive envelope: 0 → peak in `atk` (linear), then exponential decay with time constant `tau`. */
export function pluck(p: AudioParam, t: number, atk: number, peak: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + atk);
  p.setTargetAtTime(0, t + atk, tau);
}
