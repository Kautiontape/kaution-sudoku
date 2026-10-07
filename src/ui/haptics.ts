/** Vibration patterns (Android; a silent no-op where unsupported). */
import { settings } from "./settings";

const PATTERNS = {
  tap: [6],
  place: [10],
  note: [4],
  complete: [14, 40, 22],
  multi: [18, 30, 18, 30, 36],
  mistake: [40, 40, 40],
  solved: [30, 60, 30, 60, 90],
} as const;

export function buzz(kind: keyof typeof PATTERNS): void {
  if (!settings().haptics) return;
  try {
    navigator.vibrate?.([...PATTERNS[kind]]);
  } catch {
    /* not allowed (e.g. before user gesture) */
  }
}
