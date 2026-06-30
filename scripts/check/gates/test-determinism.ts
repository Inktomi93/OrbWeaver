// Gate: test-determinism (spine/testing.md §3 / structure.md §7) — no ambient clock/random/unseeded id
// under tests/. Tests inject the frozen clock + seeded ids (tests/support) through the same composition
// seam production uses; reading the real clock or Math.random makes rolling-pair / recall-ordering
// assertions flaky. Exempts support/ (the determinism seam itself) + e2e/ (real-browser full-stack).
// (A ts-morph/fs gate, not biome noRestrictedGlobals — that can ban the `Date` global but NOT the
// `Math.random`/`crypto.randomUUID` member calls, and can't exempt support/ or check `new Date()` arity.)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Check, Violation } from "../harness.ts";

const TS_FILE = /\.tsx?$/u;
const BANNED: readonly { readonly re: RegExp; readonly what: string }[] = [
  {
    re: /\bDate\.now\s*\(/u,
    what: "Date.now() — inject the frozen clock (tests/support/clock.ts)",
  },
  {
    re: /\bnew\s+Date\s*\(\s*\)/u,
    what: "new Date() with no args — ambient clock; use the injected clock",
  },
  { re: /\bMath\.random\s*\(/u, what: "Math.random() — nondeterministic; seed it or inject" },
  {
    re: /\.randomUUID\s*\(/u,
    what: "randomUUID() — unseeded id; use the seeded ids (tests/support/ids.ts)",
  },
  { re: /\bperformance\.now\s*\(/u, what: "performance.now() — ambient clock" },
];

function relPath(base: string, abs: string): string {
  return abs.startsWith(base) ? abs.slice(base.length + 1) : abs;
}

function inScope(rel: string, name: string): boolean {
  if (!TS_FILE.test(name)) {
    return false;
  }
  const top = rel.split("/")[0];
  // support/ is the determinism seam; e2e/ is real-browser full-stack.
  return top !== "support" && top !== "e2e";
}

function scanFile(rel: string, abs: string): Violation[] {
  const out: Violation[] = [];
  for (const [index, line] of readFileSync(abs, "utf8").split("\n").entries()) {
    for (const { re, what } of BANNED) {
      if (re.test(line)) {
        out.push({
          file: `tests/${rel}`,
          line: index + 1,
          message: `ambient nondeterminism: ${what}`,
        });
      }
    }
  }
  return out;
}

export const testDeterminism: Check = {
  name: "test-determinism",
  run: ({ root }): Violation[] => {
    const violations: Violation[] = [];
    const testsDir = join(root, "tests");
    if (!existsSync(testsDir)) {
      return violations;
    }
    for (const entry of readdirSync(testsDir, { recursive: true, withFileTypes: true })) {
      const abs = join(entry.parentPath, entry.name);
      const rel = relPath(testsDir, abs);
      if (entry.isFile() && inScope(rel, entry.name)) {
        violations.push(...scanFile(rel, abs));
      }
    }
    return violations;
  },
};
