// Gate: component-size (docs/architecture/core/Core-Laws-and-Precedents.md; neo parity) — a hard
// file-size cap on @orb/client sources so "I'll split it later" can't survive a check run. The cap is a
// structural guard, not a style preference (≤250 lines stays the WRITING guideline in UI-Arch); it
// exists so god-component sprawl is caught before splitting becomes a week's work. `.ts` is gated
// alongside `.tsx` because sprawl hides in a verb-dispatch hook or a mega-store just as readily as in a
// surface — gating only `.tsx` would leave that whole class invisible. Greenfield: no OVERSIZE_DEBT
// grandfather list (neo carried one); the first file to breach the cap fails, which is the point.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";

const CLIENT_SRC = "packages/client/src";
// Route shells orchestrate slots + suspense boundaries — a small allowance over the default.
const ROUTES_PREFIX = "packages/client/src/routes/";
// Caps. Bump in a review-visible commit alongside the file you're bumping for — never quietly.
const CAP_DEFAULT = 450;
const CAP_ROUTE = 500;
const SKIP_DIRS = new Set(["node_modules", "dist", "__screenshots__"]);
const SKIP_RE = /\.(?:test|spec|gen)\.tsx?$/u;
const TRAILING_NL = /\n$/u;

function isGatedSource(name: string): boolean {
  const isTs = name.endsWith(".tsx") || name.endsWith(".ts");
  // Tests, generated files, and ambient declarations are exempt — they're not hand-authored surfaces.
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
function scanComponentSize(root: string): Violation[] {
  const base = join(root, CLIENT_SRC);
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
    const cap = rel.startsWith(ROUTES_PREFIX) ? CAP_ROUTE : CAP_DEFAULT;
    if (lines > cap) {
      out.push({
        file: rel,
        line: cap + 1,
        message: `${lines} lines (cap ${cap}) — split into sub-files under a bucket or extract pure logic to a hook/lib. A god-component is a UI-Architecture-and-Layout.md §2.1 smell.`,
      });
    }
  }
  return out;
}

export const componentSize: Check = {
  name: "component-size",
  run: (ctx: CheckContext): Violation[] => scanComponentSize(ctx.root),
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// component-size walks the real fs (readdirSync recursion + readFileSync line counts of client src) — a
// `run` descriptor over ctx.root reusing the scan, with `fsBacked` so conformance materializes examples
// to a real temp dir. The finding lands at `cap+1` (the first over-cap line). Byte-identical to the
// legacy Check. Kept ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "component-size",
  docRow: "Core-Laws-and-Precedents.md (UI-Architecture-and-Layout.md §2.1)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a client source file exceeds the hard line cap (default 450, routes 500) — split it into sub-files under a bucket or extract pure logic to a hook/lib; a god-component is a UI-Architecture-and-Layout.md §2.1 smell.",
  fix: "split the file into sub-files under a bucket, or extract pure logic to a hook/lib — the cap is a structural guard, not a style preference.",
  run: (ctx) => {
    for (const v of scanComponentSize(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/big/big.tsx": "export const x = 1;\n".repeat(CAP_DEFAULT + 1),
      },
      expect: { messageIncludes: "cap 450" },
      why: "a client file one line over the 450 default cap — a god-component (§2.1)",
    },
  ],
  mustPass: [
    {
      files: { "packages/client/src/small/small.tsx": "export const x = 1;\n" },
      why: "a small client file well under the cap — passes",
    },
  ],
};
