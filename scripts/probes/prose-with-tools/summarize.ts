// Reads a dated results directory's `cells.jsonl` and prints the RESULTS.md table: one line per cell x stream
// mode with every repeat summed, plus each cell's verdict. A later line for the same cell, mode and repeat
// replaces an earlier one (a re-run).
//
//   node scripts/probes/prose-with-tools/summarize.ts scripts/probes/prose-with-tools/results/<date>

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

interface CellLine {
  readonly cell: string;
  readonly server: string;
  readonly model: string;
  readonly template: string;
  readonly mode: string;
  readonly rep?: number;
  readonly turns: number;
  readonly both: number;
  readonly proseOnly: number;
  readonly toolsOnly: number;
  readonly empty: number;
  readonly errors: number;
  readonly leaks: number;
  readonly maxPromptTokens: number;
  readonly medianTokPerSec: number | null;
  readonly medianServerTokPerSec: number | null;
}

interface CellTotal {
  readonly first: CellLine;
  readonly reps: number;
  readonly turns: number;
  readonly both: number;
  readonly proseOnly: number;
  readonly toolsOnly: number;
  readonly empty: number;
  readonly errors: number;
  readonly leaks: number;
  readonly maxPromptTokens: number;
  readonly tokPerSec: string;
  readonly serverTokPerSec: string;
}

// The bar a cell clears in BOTH stream modes before it may state `silencesProse: false`: co-emission on a fifth
// of the turns or more, and no turn the app cannot carry. Folded costs one call on a co-emitting turn and two on
// a miss (a tools-only turn takes the engine's narrative recovery pass, a prose-only turn the post-commit round),
// and the cheap round always costs two, so any real co-emission rate is a saving and no miss loses output. An
// empty reply, an error, or call markup leaked into the prose does lose output, so one of those fails the cell.
const CO_EMIT_RATE_FLOOR = 0.2;

const PERCENT = 100;
const pct = (n: number, d: number): string => `${Math.round((n / Math.max(1, d)) * PERCENT)}%`;

function coEmits(cell: CellTotal): boolean {
  return cell.errors === 0 && cell.leaks === 0 && cell.empty === 0 && cell.both / cell.turns >= CO_EMIT_RATE_FLOOR;
}

/** The per-repeat medians, listed: a mean of medians would hide a slow repeat. */
function rates(values: readonly (number | null)[]): string {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? "-" : known.map((v) => Math.round(v * TENTHS) / TENTHS).join(" / ");
}

const TENTHS = 10;
const MS_PER_SECOND = 1000;

interface TurnTiming {
  readonly totalMs: number;
  readonly completionTokens: number | null;
}

/** End-to-end tok/s re-derived from a repeat's turns, so a repeat written before the probe settled on the
 *  end-to-end clock reads on the same basis as the rest. */
function endToEndTokPerSec(line: CellLine): number | null {
  const file = path.join(dir ?? "", `${line.cell}.${line.mode}.r${line.rep ?? 1}.json`);
  const { rows } = JSON.parse(readFileSync(file, "utf8")) as { rows: readonly TurnTiming[] };
  const perTurn = rows
    .filter((r) => r.totalMs > 0 && (r.completionTokens ?? 0) > 0)
    .map((r) => ((r.completionTokens ?? 0) / r.totalMs) * MS_PER_SECOND)
    .sort((a, b) => a - b);
  const mid = perTurn[Math.floor(perTurn.length / 2)];
  return mid === undefined ? null : Math.round(mid * TENTHS) / TENTHS;
}

function total(lines: readonly CellLine[]): CellTotal {
  const sum = (key: "turns" | "both" | "proseOnly" | "toolsOnly" | "empty" | "errors" | "leaks"): number => lines.reduce((acc, l) => acc + l[key], 0);
  const [first] = lines;
  if (first === undefined) {
    throw new Error("a cell total needs at least one line");
  }
  return {
    first,
    reps: lines.length,
    turns: sum("turns"),
    both: sum("both"),
    proseOnly: sum("proseOnly"),
    toolsOnly: sum("toolsOnly"),
    empty: sum("empty"),
    errors: sum("errors"),
    leaks: sum("leaks"),
    maxPromptTokens: Math.max(...lines.map((l) => l.maxPromptTokens)),
    tokPerSec: rates(lines.map(endToEndTokPerSec)),
    serverTokPerSec: rates(lines.map((l) => l.medianServerTokPerSec)),
  };
}

const dir = process.argv[2];
if (dir === undefined) {
  throw new Error("usage: summarize.ts <results dir>");
}
const latest = new Map<string, CellLine>();
for (const text of readFileSync(path.join(dir, "cells.jsonl"), "utf8")
  .split("\n")
  .filter((l) => l.trim() !== "")) {
  const line = JSON.parse(text) as CellLine;
  latest.set(`${line.cell}\u0000${line.mode}\u0000${line.rep ?? 1}`, line);
}
const byCellMode = Map.groupBy(latest.values(), (l) => `${l.cell}\u0000${l.mode}`);
const totals = [...byCellMode.values()].map(total);
console.log(
  "| Cell | Server | Model | Template | Mode | Reps | Both | Prose only | Tools only | Empty | Errors | Leaks | Max prompt tok | tok/s (client) | tok/s (server) |",
);
console.log("| - | - | - | - | - | - | - | - | - | - | - | - | - | - | - |");
for (const t of totals) {
  const l = t.first;
  console.log(
    `| ${l.cell} | ${l.server} | ${l.model} | ${l.template} | ${l.mode} | ${t.reps} | ${t.both}/${t.turns} (${pct(t.both, t.turns)}) | ${t.proseOnly} | ${t.toolsOnly} | ${t.empty} | ${t.errors} | ${t.leaks} | ${t.maxPromptTokens} | ${t.tokPerSec} | ${t.serverTokPerSec} |`,
  );
}
console.log("\n| Cell | Verdict |\n| - | - |");
for (const cell of new Set(totals.map((t) => t.first.cell))) {
  const modes = totals.filter((t) => t.first.cell === cell);
  const clears = modes.length === 2 && modes.every(coEmits);
  console.log(`| ${cell} | ${clears ? "co-emits in both modes: `silencesProse: false`" : "does not clear the bar in both modes: stays closed"} |`);
}
