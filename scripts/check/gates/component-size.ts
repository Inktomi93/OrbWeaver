// Gate: component-size (docs/architecture/core/Core-Laws-and-Precedents.md; neo parity) — a hard
// file-size cap on @orb/client sources so "I'll split it later" can't survive a check run. The cap is a
// structural guard, not a style preference (≤250 lines stays the WRITING guideline in UI-Arch); it
// exists so god-component sprawl is caught before splitting becomes a week's work. `.ts` is gated
// alongside `.tsx` because sprawl hides in a verb-dispatch hook or a mega-store just as readily as in a
// surface — gating only `.tsx` would leave that whole class invisible. Greenfield: no OVERSIZE_DEBT
// grandfather list (neo carried one); the first file to breach the cap fails, which is the point.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
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

export const componentSize: Check = {
  name: "component-size",
  run: (ctx: CheckContext): Violation[] => {
    const base = join(ctx.root, CLIENT_SRC);
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
  },
};
