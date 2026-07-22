// Gate: component-size-ui — the @orb/ui twin of component-size (which caps @orb/client only).
// A hard LOC ceiling on packages/ui/src sources (UI-Primitives-and-Reuse.md §13.7 — a primitive is one
// sealed component). ACTIVE since 2026-07-17: the founding debt was cleared (W1-1 split table.tsx to
// 376 < 450) and the owner flipped the switch.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const UI_SRC = "packages/ui/src";
const CAP = 450;
// A comfortably-over-cap line count for the exempt-file conformance examples (a CT/fixture/.d.ts file
// well past CAP must STILL pass because it is exempt by name, not by size).
const OVER_CAP_LINES = CAP + CAP;
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

/** The fs scan the descriptor's `run` drives. */
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

export const gate: GateDescriptor = {
  name: "component-size-ui",
  docRow: "UI-Primitives-and-Reuse.md §13.7",
  status: "active",
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
    {
      files: { "packages/ui/src/edge/edge.tsx": "export const x = 1;\n".repeat(CAP) },
      why: "exactly at the 450 cap (boundary) — the cap is >450, so this passes",
    },
    {
      files: {
        "packages/ui/src/x/x.ct.tsx": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/ui/src/x/x.fixtures.tsx": "export const x = 1;\n".repeat(OVER_CAP_LINES),
        "packages/ui/src/x/x.d.ts": "export const x = 1;\n".repeat(OVER_CAP_LINES),
      },
      why: "test / CT / fixture / .d.ts files are exempt at any size — not hand-authored primitives, passes",
    },
  ],
};
