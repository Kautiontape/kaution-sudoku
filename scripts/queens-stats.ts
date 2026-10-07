/**
 * Queens generator report: for each difficulty, run `generateQueensFor`'s attempt loop for seeds
 * 1..count and print the success rate (per seed and per attempt), rejection reasons, timing,
 * sizes, region-size mix and the hardest step each puzzle needed.
 *
 *   npx tsx scripts/queens-stats.ts [--count 50] [--difficulty easy,medium,hard,expert]
 */
import { attemptFor } from "../src/engine/queens/generate";
import { solveLogically } from "../src/engine/queens/logical";
import type { QStep } from "../src/engine/queens/types";
import { DIFFICULTIES, type Difficulty } from "../src/engine/types";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const count = Number(arg("count", "50"));
const maxAttempts = Number(arg("max-attempts", "3000"));
const difficulties = arg("difficulty", DIFFICULTIES.join(",")).split(",") as Difficulty[];

const pct = (x: number, total: number) => `${((100 * x) / Math.max(total, 1)).toFixed(0)}%`;
const bump = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1);
const fmt = (rec: Record<string, number>, total: number) =>
  Object.entries(rec)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k} ${v} (${pct(v, total)})`)
    .join(", ");

/** "touch t3", "confinement k3", "contradiction chain 2"... for the hardest step. */
function label(s: QStep): string {
  if (s.technique === "confinement") return `confinement k${s.explain.k as number}`;
  if (s.technique === "contradiction") return `contradiction chain ${(s.explain.chain as unknown[]).length}`;
  if (s.technique === "touch") return `touch t${s.tier}`;
  return s.technique;
}

for (const difficulty of difficulties) {
  let ok = 0;
  let attempts = 0;
  let totalMs = 0;
  let maxMs = 0;
  let steps = 0;
  let regions = 0;
  const reasons: Record<string, number> = {};
  const hardest: Record<string, number> = {};
  const sizes: Record<string, number> = {};
  const regionMix: Record<string, number> = {};
  const failures: number[] = [];
  for (let seed = 1; seed <= count; seed++) {
    const t0 = performance.now();
    let found = false;
    for (let attempt = 0; attempt < maxAttempts && !found; attempt++) {
      attempts++;
      const res = attemptFor(difficulty, seed, attempt);
      if (!res.ok) {
        bump(reasons, res.reason);
        continue;
      }
      found = true;
      const ms = performance.now() - t0;
      totalMs += ms;
      maxMs = Math.max(maxMs, ms);
      ok++;
      const p = res.puzzle;
      steps += res.grade.steps;
      const top = solveLogically(p).steps.reduce((a, b) => (b.rating > a.rating ? b : a));
      bump(hardest, label(top));
      bump(sizes, `${p.n}x${p.n}`);
      const per = new Array<number>(p.n).fill(0);
      for (const g of p.regions) per[g]!++;
      for (const s of per) {
        bump(regionMix, s <= 3 ? "1-3" : s <= 6 ? "4-6" : s <= 10 ? "7-10" : s <= 15 ? "11-15" : "16+");
        regions++;
      }
    }
    if (!found) {
      totalMs += performance.now() - t0;
      failures.push(seed);
    }
  }
  console.log(`\n${difficulty}: ${ok}/${count} seeds succeeded; ${pct(ok, attempts)} of ${attempts} attempts accepted`);
  console.log(`  rejections: ${fmt(reasons, attempts)}`);
  console.log(`  time: avg ${(totalMs / count).toFixed(1)} ms, max ${maxMs.toFixed(0)} ms per puzzle`);
  console.log(`  sizes: ${fmt(sizes, ok)}; avg steps ${(steps / Math.max(ok, 1)).toFixed(1)}`);
  console.log(`  hardest step: ${fmt(hardest, ok)}`);
  console.log(`  region sizes: ${fmt(regionMix, regions)}`);
  if (failures.length) console.log(`  failed seeds: ${failures.join(", ")}`);
}
