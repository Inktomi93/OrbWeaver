// Gate: monotonic-tests — DORMANT (see docs/architecture/core/Core-Enforcement-Deferred-Dropped.md
// "monotonic-tests": activates when "first real test suite + baseline file"). Ported from neo-tavern's
// scripts/check/monotonic-tests.ts onto orb's `Check` interface + the central `tests/` tree; the
// shared harness project (harness.ts's `getProject`) already loads `tests/**/*.ts` + `tests/**/*.tsx`,
// so every lane (`.test.ts`/`.int.test.ts`/`.ct.tsx`/`.spec.ts`/…) is covered without a second glob.
//
// DORMANT BY DECISION (Nate 2026-07-04, scratch/dev-tooling-support-kit-plan.md) — NOT listed in
// `ALL_CHECKS` (scripts/check/report.ts), so it never runs as part of `pnpm check:structure` today.
// ACTIVATE by adding, verbatim:
//   import { monotonicTests } from "./gates/monotonic-tests.ts";
// and a `monotonicTests,` entry to the `ALL_CHECKS` array in scripts/check/report.ts.
//
// The permanent "wrong-but-green" guard: every OTHER gate verifies the code; this one verifies the
// SUITE — a green `pnpm check` must never be reachable by quietly deleting or disabling tests (the
// cheapest way to turn a red build green, and the one class nothing else catches: a deleted assertion
// leaves no diff-visible trace in the CODE, only in the test file; a `.skip` is invisible to `tsc`).
//
// Two teeth are LIVE today (pure static AST + fs, no external process — a `Check.run` is synchronous):
//
//   1. forbidden-skip — a NEW unconditional `it.skip`/`test.only`/`test.todo`/`test.fixme` MODIFIER
//      call. Conditional forms are allowed: vitest's `it.skipIf(cond)`/`it.runIf(cond)` (exact-name
//      match — `skipIf` never collides with `skip`) and Playwright's runtime guard
//      `test.skip(cond, "reason")` (a condition arg, no test-body function) both legitimately gate a
//      test on env/engine availability. The structural tell: the MODIFIER form carries a
//      function/arrow body or a string-literal title (it's declaring/naming a test); the
//      runtime-guard form carries neither. Escape hatch: `// allow-skip: <reason>` on the line itself
//      or the line above (mirrors `commented-code`'s `// keep-commented:` convention).
//   2. deleted-test-file — a test file listed in a committed baseline manifest
//      (`docs/test-baseline/manifest.json`) no longer exists on disk (catches "delete the failing
//      spec"). Read-only here — no `--write`/regen mode ships with this port: a `Check.run(ctx)` is a
//      pure synchronous function, so it can't shell out to (re)generate a baseline. The manifest
//      doesn't exist in orb yet, so tooth 2 is a documented no-op (zero violations) until one is
//      authored and committed — dormant-within-dormant, exactly matching the deferred-registry
//      condition ("+ baseline file").
//
// NOT PORTED — neo's third tooth (pass-floor: `numPassedTests + numPendingTests` must not drop below
// a committed floor). It needs a LIVE vitest run's counts; `report.ts` never runs vitest anywhere in
// the `check:structure` chain (that's `pnpm test`, a separate step), so there is no synchronous,
// in-process way to feed this Check a live count today. Revisit if/when `pnpm check` ever wires a
// test-count input through to the structure gates.
//
// Self-tested: tests/tooling/monotonic-tests.int.test.ts drives both teeth over synthetic fixtures
// (an in-memory ts-morph project for tooth 1, a temp dir for tooth 2's manifest/fs check) — never the
// real tree — proving fire AND no-false-positive.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CallExpression, SourceFile, Node as TsMorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, CheckContext, Violation } from "../harness.ts";

const BASELINE_REL = "docs/test-baseline/manifest.json";
const TEST_APIS = new Set(["it", "test", "describe", "suite", "bench"]);
const FORBIDDEN_MODIFIERS = new Set(["skip", "only", "todo", "fixme"]);
const ALLOW_SKIP_RE = /allow-skip/u;

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// The leftmost identifier of a property-access chain: for `test.describe.skip` the chain is
// PropertyAccess(PropertyAccess(Identifier "test")) — walk the `.expression` spine to the root so
// `it`/`test`/`describe` is recognized through nested member access (`test.describe.only`, etc.).
function rootIdentifier(node: TsMorphNode): string | undefined {
  let cursor: TsMorphNode | undefined = node;
  while (cursor !== undefined && Node.isPropertyAccessExpression(cursor)) {
    cursor = cursor.getExpression();
  }
  return cursor !== undefined && Node.isIdentifier(cursor) ? cursor.getText() : undefined;
}

// True when a `<root>.<modifier>(...)` call is the MODIFIER form (declares a skipped/focused/todo
// test) rather than a runtime guard. `only`/`todo` have no conditional variant — always the modifier
// form. `skip`/`fixme` are the modifier form when they declare a test (a function/arrow argument, or a
// bare/string-literal-titled call); the runtime-guard form (`test.skip(cond, "reason")`) carries a
// condition expression and no test-body function.
function isForbiddenModifierCall(call: CallExpression, modifier: string): boolean {
  const args = call.getArguments();
  if (modifier === "only" || modifier === "todo") {
    return true;
  }
  if (args.length === 0) {
    return true; // bare `test.skip()` — unconditional skip-rest-of-test.
  }
  const hasFunctionArg = args.some((a) => Node.isArrowFunction(a) || Node.isFunctionExpression(a));
  if (hasFunctionArg) {
    return true; // `it.skip("name", () => {…})`.
  }
  const first = args[0];
  return (
    first !== undefined &&
    (Node.isStringLiteral(first) || Node.isNoSubstitutionTemplateLiteral(first))
  ); // `test.skip("just a title")` — no condition arg.
}

function hasAllowSkip(lines: readonly string[], lineNo: number): boolean {
  const here = lines[lineNo - 1] ?? "";
  const above = lines[lineNo - 2] ?? "";
  return ALLOW_SKIP_RE.test(here) || ALLOW_SKIP_RE.test(above);
}

function scanForbiddenSkips(sf: SourceFile, rel: string, out: Violation[]): void {
  const lines = sf.getFullText().split("\n");
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expr = call.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      continue;
    }
    const modifier = expr.getName();
    if (!FORBIDDEN_MODIFIERS.has(modifier)) {
      continue; // exact match only — `skipIf`/`runIf` never qualify.
    }
    const root = rootIdentifier(expr.getExpression());
    if (root === undefined || !TEST_APIS.has(root)) {
      continue;
    }
    if (!isForbiddenModifierCall(call, modifier)) {
      continue; // runtime guard — allowed.
    }
    const line = call.getStartLineNumber();
    if (hasAllowSkip(lines, line)) {
      continue;
    }
    out.push({
      file: rel,
      line,
      message: `\`${root}.${modifier}\` disables a test unconditionally — the suite can't go green by skipping. Gate it with \`.skipIf(cond)\` / Playwright's \`test.skip(cond, "reason")\` if it needs an env/engine, or add \`// allow-skip: <reason>\` above the line if it's truly justified (Spine-Testing.md §5).`,
    });
  }
}

interface Manifest {
  readonly testFiles: readonly string[];
}

function readManifest(root: string): Manifest | undefined {
  let raw: string;
  try {
    raw = readFileSync(join(root, BASELINE_REL), "utf-8");
  } catch {
    return; // no baseline yet — tooth 2 stays a documented no-op (see header).
  }
  const parsed = JSON.parse(raw) as { testFiles?: unknown };
  return Array.isArray(parsed.testFiles) ? { testFiles: parsed.testFiles as string[] } : undefined;
}

function scanDeletedTestFiles(root: string, out: Violation[]): void {
  const manifest = readManifest(root);
  if (manifest === undefined) {
    return;
  }
  for (const f of manifest.testFiles) {
    if (!existsSync(join(root, f))) {
      out.push({
        file: f,
        line: 0,
        message:
          "test file in the committed baseline manifest no longer exists — a spec can't be deleted to go green. If the deletion/rename is intended, regenerate and commit the manifest diff (Spine-Testing.md §5).",
      });
    }
  }
}

/** The AST(+manifest-fs) scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanMonotonicTests({ root, project }: CheckContext): Violation[] {
  const violations: Violation[] = [];
  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    if (!filePath.includes("/tests/")) {
      continue;
    }
    scanForbiddenSkips(sf, relPath(root, filePath), violations);
  }
  scanDeletedTestFiles(root, violations);
  return violations;
}

export const monotonicTests: Check = {
  name: "monotonic-tests",
  run: (ctx): Violation[] => scanMonotonicTests(ctx),
};

// ── SINGLE-PASS CONTRACT FORM (§1.2 — the suite-monotonicity guard via `run`, DORMANT) ─────────────
// monotonic-tests scans every tests/** file for a NEW unconditional skip/only/todo/fixme modifier (tooth 1
// — AST via the shared Project) and reconciles a committed baseline manifest against disk (tooth 2 — a
// documented no-op until a manifest exists). It ports as a `run` descriptor reusing the exact scan (NOT
// fsBacked — tooth 1 is AST-only and tooth 2 gracefully no-ops when the manifest file is absent, exactly
// as on the real tree today). status:"dormant" — the loader loads it, the runner skips it, but conformance
// runs it as-active so its tooth-1 proof holds. Byte-identical to the legacy Check. Kept ALONGSIDE it.
export const gate: GateDescriptor = {
  name: "monotonic-tests",
  docRow: "Core-Enforcement-Deferred-Dropped.md (monotonic-tests) / Spine-Testing.md §5",
  status: "dormant",
  scopeSafety: "whole-project",
  message:
    "a test is disabled unconditionally (`it.skip`/`test.only`/`.todo`/`.fixme` modifier) or a baseline-manifest test file was deleted — the suite must not go green by skipping or deleting tests (Spine-Testing.md §5).",
  fix: 'gate the skip on a condition (`.skipIf(cond)` / `test.skip(cond, "reason")`) or add `// allow-skip: <reason>`; and never delete a baselined spec to go green (Spine-Testing.md §5).',
  run: (ctx) => {
    for (const v of scanMonotonicTests({ root: ctx.root, project: ctx.project })) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  // NOTE: tooth 2 (deleted-baseline-manifest reconciliation) reads a committed `docs/test-baseline/
  // manifest.json` from disk. A deleted-file FLAG needs a real temp-dir tree with a manifest.json present
  // — this descriptor is NOT fsBacked (tooth 1 is AST-only; tooth 2 gracefully no-ops when the manifest is
  // absent, as on the real tree today), so an in-memory example can't materialize a manifest. That FLAG is
  // retained in tests/tooling/monotonic-tests.residual.test.ts. The no-baseline no-op IS exercised by every
  // tooth-1 example below (each runs tooth 2 with no manifest and stays clean). Tooth 1 ports fully:
  mustFlag: [
    {
      files: 'it.skip("later", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/x.test.ts",
      expect: { messageIncludes: "unconditionally" },
      why: 'a bare `it.skip("title", fn)` modifier — an unconditional skip the suite can\'t go green by (§5)',
    },
    {
      files: 'test.only("focused", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/only.test.ts",
      expect: { messageIncludes: "test.only" },
      why: "test.only has no conditional variant — always the forbidden modifier form",
    },
    {
      files: 'test.todo("later");\n',
      at: "tests/tooling/todo.test.ts",
      expect: { messageIncludes: "test.todo" },
      why: "test.todo has no conditional variant — always the forbidden modifier form",
    },
  ],
  mustPass: [
    {
      files:
        'it.skipIf(process.env.CI === undefined)("gated", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/ok.test.ts",
      why: "a conditional `.skipIf(cond)` gate (env/engine) — exact-name match, never the forbidden modifier",
    },
    {
      files:
        'test("some flow", async ({ page }) => {\n  test.skip(!!process.env.CI, "flaky in CI");\n  await page.goto("/");\n});\n',
      at: "tests/e2e/z.spec.ts",
      why: "Playwright's runtime test.skip(cond, reason) guard (condition arg, no test body) — allowed",
    },
    {
      files:
        '// allow-skip: flaky pending PD-999\nit.skip("known-flaky", () => {\n  expect(1).toBe(1);\n});\n',
      at: "tests/tooling/escape.test.ts",
      why: "the `// allow-skip: <reason>` escape hatch on the line above exempts the skip — passes",
    },
    {
      files:
        'test("iterates", () => {\n  const it = [1, 2][Symbol.iterator]();\n  it.next();\n  expect(it.next().done).toBe(true);\n});\n',
      at: "tests/tooling/iter.test.ts",
      why: "a local `it` async-iterator variable (it.next()) is not a test call — not mistaken for one, passes",
    },
    {
      files: 'it.skip("not even a real test file", () => {});\n',
      at: "packages/server/src/x.ts",
      why: "scope: a file outside tests/ is ignored entirely — passes",
    },
  ],
};
