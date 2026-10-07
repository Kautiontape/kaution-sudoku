/**
 * Sound façade used by the UI. Delegates to the synth engine once it's connected; until then
 * (and wherever Web Audio is unavailable) every call is a silent no-op.
 */
export interface SoundApi {
  unlock(): void;
  setSettings(s: { sfx?: boolean; music?: boolean; volume?: number }): void;
  setTheme(t: "abyss" | "ember" | "aurora"): void;
  startMusic(): void;
  stopMusic(): void;
  setIntensity(x: number): void;
  place(digit: number, opts?: { pan?: number; velocity?: number }): void;
  note(digit: number, on: boolean): void;
  erase(): void;
  complete(kinds: string[]): void;
  solved(): void;
  mistake(): void;
  hint(rung: number): void;
  queen(col: number, n: number): void;
  cross(): void;
  ui(kind: "tap" | "open" | "close" | "toggle" | "select"): void;
}

const noop = () => {};
let engine: SoundApi = {
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
};

export function connectSound(impl: SoundApi): void {
  engine = impl;
}

/** Stable object whose methods always forward to the current engine. */
export const sound: SoundApi = new Proxy({} as SoundApi, {
  get: (_t, key: keyof SoundApi) => (...args: unknown[]) => {
    try {
      (engine[key] as (...a: unknown[]) => void)(...args);
    } catch {
      /* sound must never break the game */
    }
  },
});
