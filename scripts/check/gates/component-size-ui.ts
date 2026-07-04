// Gate: component-size-ui — DORMANT (the @orb/ui twin of component-size, which caps @orb/client only).
// A hard LOC ceiling on packages/ui/src sources so a primitive can't sprawl into a god-file the way a
// client surface can't (docs/architecture/core/UI-Primitives-and-Reuse.md §13.7 — a primitive is ONE
// sealed component; past the cap it's doing multiple jobs / hiding logic that belongs in a lib). Cap =
// 450, the same default the client gate uses (component-size.ts) — no ui-specific number is specced,
// and the §13.7 primitive is if anything TIGHTER than a client surface, so the shared default is the
// conservative floor.
//
// DORMANT BY DECISION (W1-0c, 2026-07-04, scratch/dev-tooling-support-kit-plan.md) — NOT listed in
// `ALL_CHECKS` (scripts/check/report.ts), so it never runs in `pnpm check:structure` today, because it
// finds REAL debt on the current tree that would block the W1-0 wave from committing (green-to-commit):
//   FINDING (W1-1 backfill): packages/ui/src/primitives/table/table.tsx = 461 lines (> 450 by 11).
// The doctrine (constitution §1) is to EXPOSE such debt, not silently raise the cap to accommodate it —
// so this gate is built + self-tested, and its activation rides W1-1, which splits table.tsx (extract
// the header/row/cell sub-parts to sibling files) and THEN flips this gate live (a one-line ALL_CHECKS
// add + import, verbatim below), same as monotonic-tests/audit-client-tests.
// ACTIVATE by adding, verbatim:
//   import { componentSizeUi } from "./gates/component-size-ui.ts";
// and a `componentSizeUi,` entry to the `ALL_CHECKS` array in scripts/check/report.ts.
//
// Self-tested: tests/tooling/component-size-ui.int.test.ts drives it over a temp-dir fixture tree
// (real fs — the gate line-counts via readFileSync) proving fire (a 451-line file) AND no-false-
// positive (a 450-line file), never the real tree.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { Check, CheckContext, Violation } from "../harness.ts";

const UI_SRC = "packages/ui/src";
const CAP = 450;
const SKIP_DIRS = new Set(["node_modules", "dist", "__screenshots__"]);
const SKIP_RE = /\.(?:test|spec|ct|fixtures|gen)\.tsx?$/u;
const TRAILING_NL = /\n$/u;

function isGatedSource(name: string): boolean {
  const isTs = name.endsWith(".tsx") || name.endsWith(".ts");
  // Tests, CT/fixtures, generated files, and ambient declarations aren't hand-authored primitives.
  const isExempt = SKIP_RE.test(name) || name.endsWith(".d.ts");
  return isTs && !isExempt;
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) {
      continue;
    }
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (isGatedSource(e.name)) {
      out.push(full);
    }
  }
}

export const componentSizeUi: Check = {
  name: "component-size-ui",
  run: (ctx: CheckContext): Violation[] => {
    const base = join(ctx.root, UI_SRC);
    if (!existsSync(base)) {
      return [];
    }
    const files: string[] = [];
    walk(base, files);
    const out: Violation[] = [];
    for (const file of files) {
      const rel = relative(ctx.root, file);
      // Trim a single trailing newline so a file ending in "\n" isn't counted one line over.
      const lines = readFileSync(file, "utf8").replace(TRAILING_NL, "").split("\n").length;
      if (lines > CAP) {
        out.push({
          file: rel,
          line: CAP + 1,
          message: `${lines} lines (cap ${CAP}) — split the primitive into sub-files (parts) or extract pure logic to a lib. A god-primitive is a §13.7 smell (UI-Primitives-and-Reuse.md §13.7).`,
        });
      }
    }
    return out;
  },
};
