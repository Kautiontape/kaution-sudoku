/**
 * Local persistence. Everything lives in this browser only; every access is guarded because
 * storage can be unavailable (private windows, blocked site data) and the game must still work.
 */
const PREFIX = "cagecoach.";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: keep playing */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export interface Progress {
  /** Solved puzzle ids per "mode-difficulty". */
  solved: Record<string, string[]>;
  /** Best time (ms) per "mode-difficulty". */
  best: Record<string, number>;
  /** Hint steps applied per technique id (for the Learn screen). */
  hinted: Record<string, number>;
  /** Total puzzles solved. */
  total: number;
  /** Consecutive days with a solve. */
  streak: { last: string; days: number };
}

export function loadProgress(): Progress {
  const p = load<Partial<Progress>>("progress", {});
  return {
    solved: p.solved ?? {},
    best: p.best ?? {},
    hinted: p.hinted ?? {},
    total: p.total ?? 0,
    streak: p.streak ?? { last: "", days: 0 },
  };
}

export function saveProgress(p: Progress): void {
  save("progress", p);
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function recordSolve(mode: string, difficulty: string, id: string, ms: number): Progress {
  const p = loadProgress();
  const key = `${mode}-${difficulty}`;
  const list = p.solved[key] ?? [];
  if (!list.includes(id)) list.push(id);
  p.solved[key] = list;
  if (!p.best[key] || ms < p.best[key]!) p.best[key] = ms;
  p.total++;
  const today = todayKey();
  if (p.streak.last !== today) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    p.streak = { last: today, days: p.streak.last === todayKey(y) ? p.streak.days + 1 : 1 };
  }
  saveProgress(p);
  return p;
}

export function recordHint(technique: string): void {
  const p = loadProgress();
  p.hinted[technique] = (p.hinted[technique] ?? 0) + 1;
  saveProgress(p);
}
