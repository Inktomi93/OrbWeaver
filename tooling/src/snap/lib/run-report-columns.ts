// Derived, browser-free columns over an already-validated run index: what a run was FOR (`out`/`route`/
// `arms`) and whether it got worse than the previous run of the same name. Pure — resolution and IO stay
// in ops/run-report.ts, so a malformed file can never reach a display-only success through this module.
import { basename } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { NAV_FLAG_METHOD } from "../../_shared/nav.ts";
import type { SnapRunIndex } from "../contract/run-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --reports");

const ARMS_DISPLAY_CAP = 6;
const ROUTE_DISPLAY_CAP = 48;

function resultPairValue(index: SnapRunIndex, key: string): string | null {
  return index.resultPairs.find(([name]) => name === key)?.[1] ?? null;
}

/** The NAME the run published under — the one column that lets a reader map ten slots back to the ten
 *  commands that made them. `out=` on the RESULT line is a path when pixels were written; the argv's own
 *  `--out` still names the run when they were not (`--no-shot` prints `(none)`). */
export function runOutName(index: SnapRunIndex): string {
  const argv = index.process.argv;
  const explicit = argv[argv.indexOf("--out") + 1];
  if (argv.includes("--out") && explicit !== undefined && !explicit.startsWith("--")) {
    return basename(explicit).replace(/\.png$/u, "");
  }
  const pair = resultPairValue(index, "out");
  if (pair === null || pair === "(none)" || pair === "none") {
    return "none";
  }
  return basename(pair).replace(/\.png$/u, "");
}

/** WHERE the run pointed: the route positional plus every SPA hop it queued, in argv order. Derived from
 *  the persisted argv rather than remembered, so it stays true for a run this reader never saw. */
export function runRoute(index: SnapRunIndex): string {
  const argv = [...index.process.argv];
  const first = argv[0];
  const hops: string[] = [];
  if (first !== undefined && !first.startsWith("-")) {
    hops.push(first);
  } else if (argv.includes("--file")) {
    const file = argv[argv.indexOf("--file") + 1];
    hops.push(file === undefined ? "--file" : `file:${basename(file)}`);
  }
  for (const [position, token] of argv.entries()) {
    const method = NAV_FLAG_METHOD[token];
    const target = argv[position + 1];
    if (method !== undefined && target !== undefined && !target.startsWith("--")) {
      hops.push(`${method}:${target}`);
    }
  }
  const route = hops.length === 0 ? "(none)" : hops.join(">");
  return route.length > ROUTE_DISPLAY_CAP ? `${route.slice(0, ROUTE_DISPLAY_CAP)}…` : route;
}

/** Which arms actually measured. `off` is every arm nobody asked for, and listing those would make every
 *  row identical — the point of the column is that two runs of the same route differ. */
export function runArms(index: SnapRunIndex): string {
  const active = index.verdict.arms.filter((arm) => arm.state !== "off").map((arm) => arm.arm);
  if (active.length === 0) {
    return "none";
  }
  const shown = active.slice(0, ARMS_DISPLAY_CAP).join(",");
  return active.length > ARMS_DISPLAY_CAP ? `${shown},+${String(active.length - ARMS_DISPLAY_CAP)}` : shown;
}

/** The RESULT-line counters a run-over-run comparison is allowed to make a claim about: each is a COUNT
 *  of failures owned by one arm, so "it went up" is a fact about this checkout rather than a guess. */
const DELTA_COUNTERS: readonly (readonly [string, string])[] = [
  ["contrast-fails", "contrast"],
  ["assertion-fails", "assertions"],
  ["eval-fails", "eval"],
  ["map-fails", "map"],
  ["aria-fails", "aria"],
  ["console-errors", "console errors"],
  ["page-errors", "page errors"],
  ["failed-req", "failed requests"],
  ["steps-failed", "failed steps"],
  ["nav-actions-failed", "failed nav actions"],
  ["deadcss-fails", "dead CSS"],
  ["emptycss-fails", "empty CSS"],
  ["environment-fails", "environment"],
  ["appearance-fails", "appearance"],
];

export interface SnapRunRegression {
  readonly counter: string;
  readonly label: string;
  readonly before: number;
  readonly after: number;
}

/** Every counter that got WORSE since the previous run of the same `--out` name.
 *
 *  Only worse: a run that improved needs no row, and a run whose counter is missing on either side is not
 *  compared at all (a legacy index that never carried the pair would otherwise read as a fresh zero and
 *  manufacture a regression out of an absent measurement). */
export function runRegressions(current: SnapRunIndex, previous: SnapRunIndex): readonly SnapRunRegression[] {
  const rows: SnapRunRegression[] = [];
  for (const [counter, label] of DELTA_COUNTERS) {
    const after = Number(resultPairValue(current, counter));
    const before = Number(resultPairValue(previous, counter));
    if (Number.isFinite(after) && Number.isFinite(before) && after > before) {
      rows.push({ counter, label, before, after });
    }
  }
  return rows;
}
