// The PURE half of the scoped-run path preflight (#1192): which operands are CLAIMS, which are
// UNRESOLVED, which are BARREN. The spawning half is pinned at the CLI tier in
// tests/tooling/verify/ops/scoped-test.int.test.ts.
//
// Red-first receipt for the class, taken on the UNMODIFIED tree before this module existed (both runners
// silently accept a path that does not exist):
//   pnpm test:ct <2 real .ct.tsx> tests/client/features/discovery/components/character-library-surface.ct.tsx
//     → `CT SUMMARY — PASS  ·  4 passed`, exit 0 — the third path was never mentioned and never opened
//   pnpm test:scoped tests/tooling/smoke.test.ts tests/tooling/nope-does-not-exist.test.ts
//     → `1 passed (1)`, exit 0
import { barrenOperands, isPathShaped, resolveOperand, unresolvedOperands, unresolvedRefusal } from "@orb/tooling/_shared/scoped-run-paths";
import { expect, test } from "../../support/tool-fixtures.ts";

/** The near-miss itself: two paths that exist plus the stale one a merge floor actually named. */
const REAL_A = "tests/tooling/smoke.test.ts";
const REAL_B = "tests/tooling/_support.ts";
const STALE = "tests/client/features/discovery/components/character-library-surface.ct.tsx";

test("a path-shaped operand is a claim; a bare filter word and a flag are not", () => {
  expect(isPathShaped(REAL_A)).toBe(true);
  expect(isPathShaped("character-library-surface.ct.tsx")).toBe(true); // no separator, but a spec extension
  expect(isPathShaped("smoke")).toBe(false); // a substring filter — both runners take regexes positionally
  expect(isPathShaped("--workers=2")).toBe(false);
  expect(isPathShaped("-u")).toBe(false);
});

test("the stale path in a MIX of real ones is not silently dropped", ({ repoRoot }) => {
  const operands = [REAL_A, REAL_B, STALE].map((raw) => resolveOperand(repoRoot, raw));
  const bad = unresolvedOperands(operands, "runner");
  expect(bad.map((o) => o.raw)).toStrictEqual([STALE]);
  // The refusal NAMES the offender — "some path was bad" would cost the same re-run the silent pass did.
  expect(unresolvedRefusal(bad)).toContain(STALE);
  expect(unresolvedRefusal(bad)).not.toContain(REAL_A);
});

test("an operand outside the repo is UNRESOLVED even when it exists on disk", ({ repoRoot }) => {
  const outside = resolveOperand(repoRoot, "../../../etc/hosts");
  expect(outside.rel).toBeUndefined();
  expect(unresolvedOperands([outside], "runner")).toHaveLength(1);
});

test("a metacharacter operand is the RUNNER's to match — but only under the runner grammar", ({ repoRoot }) => {
  const pattern = resolveOperand(repoRoot, "tests/tooling/(smoke|nope).test.ts");
  expect(pattern.isPattern).toBe(true);
  // scoped-test: the runner's matcher owns it, so its emptiness is a BARREN question, not a stat() one.
  expect(unresolvedOperands([pattern], "runner")).toHaveLength(0);
  // `verify --file`: every positional is documented as a literal path, so a metacharacter excuses nothing.
  expect(unresolvedOperands([pattern], "claim")).toHaveLength(1);
});

test("BARREN is a DIFFERENT verdict from UNRESOLVED — the file is real, the run just says nothing about it", ({ repoRoot }) => {
  const operands = [REAL_A, REAL_B].map((raw) => resolveOperand(repoRoot, raw));
  expect(unresolvedOperands(operands, "runner")).toHaveLength(0); // both exist
  const barren = barrenOperands(operands, [REAL_A]); // the runner collected only the first
  expect(barren.map((o) => o.raw)).toStrictEqual([REAL_B]);
});

test("a directory operand is fed by anything beneath it, a file only by itself", ({ repoRoot }) => {
  const dir = resolveOperand(repoRoot, "tests/tooling");
  expect(dir.isDirectory).toBe(true);
  expect(barrenOperands([dir], [REAL_A])).toHaveLength(0);
  const file = resolveOperand(repoRoot, REAL_A);
  expect(barrenOperands([file], ["tests/tooling/other.test.ts"])).toHaveLength(1);
});

test("a pattern operand is fed when a collected path matches it", ({ repoRoot }) => {
  const pattern = resolveOperand(repoRoot, "tests/tooling/sm.*\\.test\\.ts");
  expect(barrenOperands([pattern], [REAL_A])).toHaveLength(0);
  expect(barrenOperands([pattern], ["tests/tooling/other.test.ts"])).toHaveLength(1);
});
