// Self-test for the DORMANT `monotonic-tests` gate (scripts/check/gates/monotonic-tests.ts — not in
// report.ts's ALL_CHECKS). Drives both live teeth directly (never via report.ts/ALL_CHECKS, since the
// gate isn't wired there) over SYNTHETIC fixtures — an in-memory ts-morph project for tooth 1
// (forbidden-skip), a real temp dir for tooth 2 (deleted-test-file, which touches real fs via
// `existsSync`/`readFileSync`) — never the real tree. `.int.test.ts` because tooth 2 does real fs I/O
// (mkdtemp/writeFile), matching this repo's own `check-gates.int.test.ts` precedent for gate self-tests.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Project } from "ts-morph";
import { monotonicTests } from "../../scripts/check/gates/monotonic-tests.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxFor } from "./_support.ts";

const NO_LONGER_EXISTS_RE = /no longer exists/u;

// ── Tooth 1: forbidden-skip ──────────────────────────────────────────────────────────────────────

test("fires on an unconditional it.skip declaring a test", () => {
  const ctx = ctxFor({
    "tests/server/x.test.ts": 'it.skip("does the thing", () => {\n  expect(1).toBe(1);\n});\n',
  });
  const violations = monotonicTests.run(ctx);
  expect(violations.some((v) => v.message.includes("`it.skip`"))).toBe(true);
});

test("fires on test.only and test.todo (no conditional variant for either)", () => {
  const ctx = ctxFor({
    "tests/server/only.test.ts": 'test.only("focused", () => {\n  expect(1).toBe(1);\n});\n',
    "tests/server/todo.test.ts": 'test.todo("later");\n',
  });
  const violations = monotonicTests.run(ctx);
  expect(violations.some((v) => v.message.includes("`test.only`"))).toBe(true);
  expect(violations.some((v) => v.message.includes("`test.todo`"))).toBe(true);
});

test("does NOT fire on vitest's conditional it.skipIf(cond) (exact-name match, not a substring of skip)", () => {
  const ctx = ctxFor({
    "tests/server/y.test.ts":
      'it.skipIf(process.platform === "win32")("posix only", () => {\n  expect(1).toBe(1);\n});\n',
  });
  expect(monotonicTests.run(ctx)).toEqual([]);
});

test("does NOT fire on Playwright's runtime test.skip(cond, reason) guard (condition arg, no test body)", () => {
  const ctx = ctxFor({
    "tests/e2e/z.spec.ts":
      'test("some flow", async ({ page }) => {\n  test.skip(!!process.env.CI, "flaky in CI");\n  await page.goto("/");\n});\n',
  });
  expect(monotonicTests.run(ctx)).toEqual([]);
});

test("does NOT fire when the escape hatch comment is present", () => {
  const ctx = ctxFor({
    "tests/server/w.test.ts":
      '// allow-skip: flaky pending PD-999\nit.skip("known-flaky", () => {\n  expect(1).toBe(1);\n});\n',
  });
  expect(monotonicTests.run(ctx)).toEqual([]);
});

test("does NOT mistake a local `it` async-iterator variable for a test call", () => {
  const ctx = ctxFor({
    "tests/server/iter.test.ts":
      'test("iterates", () => {\n  const it = [1, 2][Symbol.iterator]();\n  it.next();\n  expect(it.next().done).toBe(true);\n});\n',
  });
  expect(monotonicTests.run(ctx)).toEqual([]);
});

test("ignores files outside tests/ entirely", () => {
  const ctx = ctxFor({
    "packages/server/src/x.ts": 'it.skip("not even a real test file", () => {});\n',
  });
  expect(monotonicTests.run(ctx)).toEqual([]);
});

// ── Tooth 2: deleted-test-file ───────────────────────────────────────────────────────────────────

test("fires when a manifest-listed test file no longer exists on disk", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-monotonic-"));
  const manifestDir = join(root, "docs", "test-baseline");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, "manifest.json"),
    JSON.stringify({ testFiles: ["tests/server/gone.test.ts"] }),
  );
  const project = new Project({ useInMemoryFileSystem: true });
  const violations = monotonicTests.run({ root, project });
  rmSync(root, { recursive: true, force: true });
  expect(
    violations.some(
      (v) => v.file === "tests/server/gone.test.ts" && NO_LONGER_EXISTS_RE.test(v.message),
    ),
  ).toBe(true);
});

test("tooth 2 is a documented no-op when no baseline manifest is committed (dormant-within-dormant)", () => {
  const root = mkdtempSync(join(tmpdir(), "orb-monotonic-nobaseline-"));
  const project = new Project({ useInMemoryFileSystem: true });
  const violations = monotonicTests.run({ root, project });
  rmSync(root, { recursive: true, force: true });
  expect(violations).toEqual([]);
});
