// Near-cap advisory (#644) — a READ-ONLY file-size band scan for `pnpm check:show`, mirroring the caps
// the three line-cap gates already enforce (component-size / component-size-ui / tooling-size) WITHOUT
// gating: a file a few lines under its cap is a FACT a lane needs BEFORE it edits (a one-member tuple
// addition + biome's re-wrap turns "a few lines under" into a surprise RED naming a file the edit never
// meant to restructure — measured twice in one day: shell-store.ts 443→453, rule-preset-picker.tsx
// 516/450). It is never a violation and this module owns NO red arm — the three cap gates keep doing
// that; this is advisory-only, computed fresh off disk every call (cheap: fs.readdir + line counts, no
// ts-morph project load, so `check:show` stays a read-don't-rerun view).
//
// Band measured before shipping (2026-08-24, #644): 11/1066 component-size files, 3/338
// component-size-ui, 2/307 tooling-size — ~1% everywhere, nowhere near a wall. A 15-line/3%-of-cap band
// is the right size; do not widen it without re-measuring.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const BAND_LINES = 15;
const BAND_FRACTION = 0.03;
const TRAILING_NL = /\n$/u;
const SKIP_DIRS = new Set(["node_modules", "dist", "__screenshots__"]);
const CLIENT_SKIP_RE = /\.(?:test|spec|gen)\.tsx?$/u;
const UI_SKIP_RE = /\.(?:test|spec|ct|fixtures|gen)\.tsx?$/u;
const CLIENT_ROUTES_PREFIX = "packages/client/src/routes/";
const CLIENT_CAP_DEFAULT = 450;
const CLIENT_CAP_ROUTE = 500;
const UI_CAP = 450;
const TOOLING_CAP_DEFAULT = 450;
const TOOLING_CAP_CLI = 200;
const TOOLING_GATES_CARVE = "/verify/gates/";

export interface NearCapRow {
  readonly gate: string;
  readonly file: string;
  readonly lines: number;
  readonly cap: number;
  readonly headroom: number;
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) {
      continue;
    }
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else {
      out.push(full);
    }
  }
}

function lineCount(file: string): number {
  return readFileSync(file, "utf8").replace(TRAILING_NL, "").split(/\r?\n/u).length;
}

/** The band width for a given cap — the max of a flat 15 lines and 3% of the cap, so a bigger cap (the
 *  500-line route allowance) gets a proportionally wider warning zone. */
function band(cap: number): number {
  return Math.max(BAND_LINES, Math.ceil(cap * BAND_FRACTION));
}

function isTsSource(absPath: string, skip: RegExp): boolean {
  return (absPath.endsWith(".tsx") || absPath.endsWith(".ts")) && !skip.test(absPath) && !absPath.endsWith(".d.ts");
}

interface ScanSpec {
  readonly gate: string;
  readonly base: string;
  readonly isGated: (absPath: string) => boolean;
  readonly capOf: (rel: string) => number;
}

function scanBase(root: string, spec: ScanSpec): NearCapRow[] {
  const absBase = join(root, spec.base);
  if (!existsSync(absBase)) {
    return [];
  }
  const files: string[] = [];
  walk(absBase, files);
  const out: NearCapRow[] = [];
  for (const f of files) {
    if (!spec.isGated(f)) {
      continue;
    }
    const rel = relative(root, f);
    const cap = spec.capOf(rel);
    const lines = lineCount(f);
    const headroom = cap - lines;
    if (headroom >= 0 && headroom <= band(cap)) {
      out.push({ gate: spec.gate, file: rel, lines, cap, headroom });
    }
  }
  return out;
}

const SCAN_SPECS: readonly ScanSpec[] = [
  {
    gate: "component-size",
    base: "packages/client/src",
    isGated: (f) => isTsSource(f, CLIENT_SKIP_RE),
    capOf: (rel) => (rel.startsWith(CLIENT_ROUTES_PREFIX) ? CLIENT_CAP_ROUTE : CLIENT_CAP_DEFAULT),
  },
  {
    gate: "component-size-ui",
    base: "packages/ui/src",
    isGated: (f) => isTsSource(f, UI_SKIP_RE),
    capOf: () => UI_CAP,
  },
  {
    gate: "tooling-size",
    base: "tooling/src",
    isGated: (f) => f.endsWith(".ts") && !f.includes(TOOLING_GATES_CARVE),
    capOf: (rel) => (rel.endsWith("/cli.ts") ? TOOLING_CAP_CLI : TOOLING_CAP_DEFAULT),
  },
];

/** Every file within its gate's near-cap band, across the three line-cap gates. Sorted by headroom
 *  ascending — the file closest to crossing (and therefore most likely to bite the NEXT edit) first. */
export function nearCapAdvisories(root: string): readonly NearCapRow[] {
  const rows = SCAN_SPECS.flatMap((spec) => scanBase(root, spec));
  return rows.sort((a, b) => a.headroom - b.headroom);
}
