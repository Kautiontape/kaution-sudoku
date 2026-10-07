/**
 * Puzzle pack generator.
 *
 *   npm run gen -- --mode classic --difficulty easy --count 60 --seed 1 --out public/packs
 *   npm run gen -- --mode all --count 60
 *
 * Writes public/packs/{mode}-{difficulty}.json. Generation is deterministic per (mode, difficulty,
 * seed). Work is spread over child processes (--workers, default: CPU count).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeSudoku, type SudokuPack } from "../src/engine/pack";
import { generateQueensFor } from "../src/engine/queens/generate";
import { encodeQueens, type QueensPack } from "../src/engine/queens/pack";
import { generateClassic, generateKiller } from "../src/engine/puzzles";
import { DIFFICULTIES, type Difficulty } from "../src/engine/types";

type Mode = "classic" | "killer" | "queens";

function generateOne(mode: Mode, difficulty: Difficulty, seed: number): unknown {
  if (mode === "queens") return encodeQueens(generateQueensFor(difficulty, seed));
  const r = mode === "classic" ? generateClassic(difficulty, seed) : generateKiller(difficulty, seed);
  return r ? encodeSudoku(r.puzzle) : null;
}

const argv = process.argv.slice(2);
const args = new Map<string, string>();
for (let i = 0; i < argv.length; i += 2) args.set(argv[i]!.replace(/^--/, ""), argv[i + 1] ?? "");

if (args.has("child")) {
  // Child: generate the listed seeds, one JSON line per puzzle.
  const mode = args.get("mode") as Mode;
  const difficulty = args.get("difficulty") as Difficulty;
  for (const seed of args.get("seeds")!.split(",").map(Number)) {
    const entry = generateOne(mode, difficulty, seed);
    process.stdout.write(JSON.stringify({ seed, entry }) + "\n");
  }
} else {
  const modeArg = args.get("mode") ?? "all";
  const modes: Mode[] = modeArg === "all" ? ["classic", "killer", "queens"] : [modeArg as Mode];
  const diffArg = args.get("difficulty") ?? "all";
  const difficulties = diffArg === "all" ? [...DIFFICULTIES] : [diffArg as Difficulty];
  const count = Number(args.get("count") ?? 60);
  const seed0 = Number(args.get("seed") ?? 1);
  const outDir = args.get("out") ?? "public/packs";
  const workers = Math.max(1, Number(args.get("workers") ?? cpus().length));
  const self = fileURLToPath(import.meta.url);
  mkdirSync(outDir, { recursive: true });

  for (const mode of modes)
    for (const difficulty of difficulties) {
      const seeds = Array.from({ length: count }, (_, i) => seed0 + i);
      const buckets: number[][] = Array.from({ length: workers }, () => []);
      seeds.forEach((s, i) => buckets[i % workers]!.push(s));
      const results = new Map<number, unknown>();
      const t0 = performance.now();
      await Promise.all(
        buckets
          .filter((b) => b.length)
          .map(
            (bucket) =>
              new Promise<void>((resolve, reject) => {
                const child = spawn(
                  process.execPath,
                  ["--import", "tsx", self, "--child", "1", "--mode", mode, "--difficulty", difficulty, "--seeds", bucket.join(",")],
                  { stdio: ["ignore", "pipe", "inherit"] },
                );
                let buf = "";
                child.stdout.on("data", (chunk: Buffer) => {
                  buf += chunk.toString();
                  let nl: number;
                  while ((nl = buf.indexOf("\n")) >= 0) {
                    const line = buf.slice(0, nl);
                    buf = buf.slice(nl + 1);
                    const m = JSON.parse(line) as { seed: number; entry: unknown };
                    results.set(m.seed, m.entry);
                    process.stdout.write(m.entry ? "." : "x");
                  }
                });
                child.on("error", reject);
                child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`child exited ${code}`))));
              }),
          ),
      );
      const entries = seeds.map((s) => results.get(s)).filter(Boolean);
      const pack: SudokuPack | QueensPack =
        mode === "queens"
          ? { version: 1, mode, difficulty, puzzles: entries as QueensPack["puzzles"] }
          : { version: 1, mode, difficulty, puzzles: entries as SudokuPack["puzzles"] };
      const file = join(outDir, `${mode}-${difficulty}.json`);
      writeFileSync(file, JSON.stringify(pack) + "\n");
      console.log(`\n${file}: ${entries.length}/${count} puzzles in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
    }
}
