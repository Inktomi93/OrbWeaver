// Gate: test-determinism (core/Spine-Testing.md §3 / core/Core-0-Architecture-and-Structure.md §7) — no ambient clock/random/unseeded id
// under tests/. Tests inject the frozen clock + seeded ids (tests/support) through the same composition
// seam production uses; reading the real clock or Math.random makes rolling-pair / recall-ordering
// assertions flaky. Exempts support/ (the determinism seam itself) + e2e/ (real-browser full-stack).
// (A ts-morph/fs gate, not biome noRestrictedGlobals — that can ban the `Date` global but NOT the
// `Math.random`/`crypto.randomUUID` member calls, and can't exempt support/ or check `new Date()` arity.)
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

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
          message: `ambient nondeterminism: ${what} — inject the frozen clock / seeded ids via the fixture seam (Spine-Testing.md §3).`,
        });
      }
    }
  }
  return out;
}

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanTestDeterminism(root: string): Violation[] {
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
}

// ── SINGLE-PASS CONTRACT FORM (§1.2 — a pure-FS `run` gate, fsBacked conformance) ──────────────────
// test-determinism reads the real fs (recursive readdirSync of tests/ + readFileSync line-scan for ambient
// clock/random) — a `run` descriptor over ctx.root reusing the scan, with `fsBacked` so conformance
// materializes examples to a real temp dir. Distinct per-source messages (which banned call) → per-
// occurrence overrides. Byte-identical to the legacy Check.
export const gate: GateDescriptor = {
  name: "test-determinism",
  docRow: "core/Spine-Testing.md §3 (core/Core-0-Architecture-and-Structure.md §7)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "ambient nondeterminism in a test (Date.now/new Date()/Math.random/randomUUID/performance.now) — inject the frozen clock + seeded ids via the fixture seam (core/Spine-Testing.md §3).",
  fix: "inject the frozen clock (tests/support/clock.ts) + seeded ids (tests/support/ids.ts) through the composition seam production uses.",
  run: (ctx) => {
    for (const v of scanTestDeterminism(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: { "tests/server/x.test.ts": "export const t = Date.now();\n" },
      expect: { messageIncludes: "Date.now" },
      why: "an ambient Date.now() in a test — inject the frozen clock (§3)",
    },
    {
      files: { "tests/server/newdate.test.ts": "export const t = new Date();\n" },
      expect: { messageIncludes: "new Date()" },
      why: "a no-arg new Date() — its own BANNED entry, distinct message + regex arm",
    },
    {
      files: { "tests/server/rand.test.ts": "export const r = Math.random();\n" },
      expect: { messageIncludes: "Math.random" },
      why: "Math.random() — its own BANNED entry (member call biome can't ban)",
    },
    {
      files: { "tests/server/uuid.test.ts": "export const id = crypto.randomUUID();\n" },
      expect: { messageIncludes: "randomUUID" },
      why: "a .randomUUID() call — its own BANNED entry (unseeded id)",
    },
    {
      files: { "tests/server/perf.test.ts": "export const p = performance.now();\n" },
      expect: { messageIncludes: "performance.now" },
      why: "performance.now() — its own BANNED entry (ambient clock)",
    },
  ],
  mustPass: [
    {
      files: { "tests/server/y.test.ts": "export const t = clock.now();\n" },
      why: "the injected clock (clock.now()) — no ambient nondeterminism, passes",
    },
    {
      files: { "tests/support/clock.test.ts": "export const t = Date.now();\n" },
      why: "a banned call under support/ — the determinism seam itself is top-dir-excluded (inScope false), passes",
    },
    {
      files: { "tests/e2e/flow.test.ts": "export const t = Date.now();\n" },
      why: "a banned call under e2e/ — real-browser full-stack is top-dir-excluded, passes",
    },
  ],
};
