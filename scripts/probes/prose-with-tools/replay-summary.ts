// Prints the per-beat co-emission table for a replay directory (`replay.ts` output): per cell and stream mode,
// each beat's co-emitting replies out of its repeats, the totals, and a 95% Wilson interval on the total.
//
//   node scripts/probes/prose-with-tools/replay-summary.ts scripts/probes/prose-with-tools/results/<date>/replay

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

interface Row {
  readonly cell: string;
  readonly beat: number;
  readonly mode: string;
  readonly shape: string;
  readonly leak?: boolean;
  readonly error?: string;
  readonly finish?: string;
}

const Z95 = 1.96;
const PERCENT = 100;

/** The 95% Wilson score interval: honest at small n and near 0% or 100%, where the normal one is not. */
function wilson(hits: number, n: number): string {
  if (n === 0) {
    return "-";
  }
  const p = hits / n;
  const z2 = Z95 * Z95;
  const twoN = n + n;
  const centre = (p + z2 / twoN) / (1 + z2 / n);
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (twoN * twoN))) / (1 + z2 / n);
  return `${Math.round((centre - half) * PERCENT)}–${Math.round((centre + half) * PERCENT)}%`;
}

const dir = process.argv[2];
if (dir === undefined) {
  throw new Error("usage: replay-summary.ts <replay dir>");
}
const rows: Row[] = readdirSync(dir)
  .filter((f) => f.endsWith(".jsonl"))
  .flatMap((f) =>
    readFileSync(path.join(dir, f), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Row),
  );
const groups = Map.groupBy(rows, (r) => `${r.cell}\u0000${r.mode}`);
const beats = [...new Set(rows.map((r) => r.beat))].sort((a, b) => a - b);
console.log(`| Cell | Mode | ${beats.map((b) => `B${b}`).join(" | ")} | Both | 95% CI | Prose only | Tools only | Empty | Leaks | Errors | Length cut |`);
console.log(`| - | - | ${beats.map(() => "-").join(" | ")} | - | - | - | - | - | - | - | - |`);
for (const [key, list] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const [cell, mode] = key.split("\u0000");
  const perBeat = beats.map((b) => {
    const at = list.filter((r) => r.beat === b);
    return `${at.filter((r) => r.shape === "both").length}/${at.length}`;
  });
  const count = (shape: string): number => list.filter((r) => r.shape === shape).length;
  const both = count("both");
  console.log(
    `| ${cell} | ${mode} | ${perBeat.join(" | ")} | ${both}/${list.length} | ${wilson(both, list.length)} | ${count("prose-only")} | ${count("tools-only")} | ${count("empty")} | ${list.filter((r) => r.leak === true).length} | ${list.filter((r) => r.error !== undefined).length} | ${list.filter((r) => r.finish === "length").length} |`,
  );
}
