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
import type { GateDescriptor } from "../contract.ts";
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

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanComponentSizeUi(root: string): Violation[] {
  const base = join(root, UI_SRC);
  if (!existsSync(base)) {
    return [];
  }
  const files: string[] = [];
  walk(base, files);
  const out: Violation[] = [];
  for (const file of files) {
    const rel = relative(root, file);
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
}

export const componentSizeUi: Check = {
  name: "component-size-ui",
  run: (ctx: CheckContext): Violation[] => scanComponentSizeUi(ctx.root),
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a DORMANT pure-FS `run` gate, fsBacked conformance) ──────────
// The @orb/ui twin of component-size. DORMANT (not in ALL_CHECKS — it finds real debt on the current
// tree; activation rides W1-1). `status: "dormant"` in the descriptor replaces the hand-kept DORMANT_GATES
// list (§1.3); the runner skips it, conformance still proves it. Reads the real fs (readFileSync line
// counts of ui src) → fsBacked. Byte-identical to the legacy Check. Kept ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "component-size-ui",
  docRow: "UI-Primitives-and-Reuse.md §13.7",
  status: "dormant",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a @orb/ui source file exceeds the 450-line cap — split the primitive into sub-files (parts) or extract pure logic to a lib; a god-primitive is a UI-Primitives-and-Reuse.md §13.7 smell.",
  fix: "split the primitive into part sub-files, or extract pure logic to a lib — a primitive is ONE sealed component.",
  run: (ctx) => {
    for (const v of scanComponentSizeUi(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/ui/src/big/big.tsx": "export const x = 1;\n".repeat(CAP + 1),
      },
      expect: { messageIncludes: "cap 450" },
      why: "a ui source one line over the 450 cap — a god-primitive (§13.7)",
    },
  ],
  mustPass: [
    {
      files: { "packages/ui/src/small/small.tsx": "export const x = 1;\n" },
      why: "a small ui source well under the cap — passes",
    },
  ],
};
