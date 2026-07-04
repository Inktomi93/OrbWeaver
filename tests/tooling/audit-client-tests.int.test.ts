// Self-test for the DORMANT `audit-client-tests` gate (scripts/check/gates/audit-client-tests.ts —
// not in report.ts's ALL_CHECKS). Drives all five rules directly (never via report.ts/ALL_CHECKS,
// since the gate isn't wired there) over an in-memory ts-morph project of SYNTHETIC fixtures — never
// the real tree. `.int.test.ts` only because it sits alongside the gate's other self-test and this
// repo's `check-gates.int.test.ts` precedent for gate self-tests; the fixtures here are pure in-memory.
import { join } from "node:path";
import { Project } from "ts-morph";
import { auditClientTests } from "../../scripts/check/gates/audit-client-tests.ts";
import type { CheckContext } from "../../scripts/check/harness.ts";
import { expect, test } from "../support/fixtures.ts";

function ctxFor(text: string, path = "tests/server/x.test.ts", root = "/repo"): CheckContext {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(join(root, path), text);
  return { root, project };
}

function messagesFor(rule: string, ctx: CheckContext): string[] {
  return auditClientTests
    .run(ctx)
    .filter((v) => v.message.includes(rule))
    .map((v) => v.message);
}

// ── Rule 1: no matcher-chained expect ────────────────────────────────────────────────────────────

test("rule 1 fires on a test with no expect(...).<matcher>() anywhere", () => {
  const ctx = ctxFor('test("does a thing", async () => {\n  await Promise.resolve();\n});\n');
  expect(messagesFor("no descendant expect", ctx).length).toBeGreaterThan(0);
});

test("rule 1 does NOT fire on a direct matcher-chained expect", () => {
  const ctx = ctxFor('test("asserts", () => {\n  expect(1).toBe(1);\n});\n');
  expect(messagesFor("no descendant expect", ctx)).toEqual([]);
});

test("rule 1 does NOT fire when the assertion lives inside a resolved assertion helper", () => {
  const ctx = ctxFor(
    // biome-ignore lint/security/noSecrets: a fixture SOURCE string (a helper function + a test call), not a secret.
    "function expectOk(x: number): void {\n  expect(x).toBeGreaterThan(0);\n}\n" +
      'test("asserts via a helper", () => {\n  expectOk(1);\n});\n',
  );
  expect(messagesFor("no descendant expect", ctx)).toEqual([]);
});

test("rule 1 recognizes expect.poll(...) as a matcher chain (bare `expect` identifier target)", () => {
  const ctx = ctxFor('test("polls", async () => {\n  await expect.poll(() => 1).toBe(1);\n});\n');
  expect(messagesFor("no descendant expect", ctx)).toEqual([]);
});

// ── Rule 2: async without await ──────────────────────────────────────────────────────────────────

test("rule 2 fires on an async callback with no AwaitExpression", () => {
  const ctx = ctxFor('test("async no await", async () => {\n  expect(1).toBe(1);\n});\n');
  expect(messagesFor("no AwaitExpression", ctx).length).toBeGreaterThan(0);
});

test("rule 2 does NOT fire on a sync callback (no async keyword)", () => {
  const ctx = ctxFor('test("sync", () => {\n  expect(1).toBe(1);\n});\n');
  expect(messagesFor("no AwaitExpression", ctx)).toEqual([]);
});

test("rule 2 does NOT fire on an async callback that does await", () => {
  const ctx = ctxFor(
    'test("async with await", async () => {\n  await Promise.resolve();\n  expect(1).toBe(1);\n});\n',
  );
  expect(messagesFor("no AwaitExpression", ctx)).toEqual([]);
});

test("rule 2 does NOT fire on a `for await (...)` loop (awaits per-iteration, no AwaitExpression node — live-verified real-tree false positive this gate now fixes)", () => {
  const ctx = ctxFor(
    'test("drains an async iterable", async () => {\n' +
      "  const out: number[] = [];\n" +
      "  for await (const x of gen()) {\n" +
      "    out.push(x);\n" +
      "  }\n" +
      "  expect(out).toEqual([1]);\n" +
      "});\n",
  );
  expect(messagesFor("no AwaitExpression", ctx)).toEqual([]);
});

// ── Rule 3: bare expect(x) ───────────────────────────────────────────────────────────────────────

test("rule 3 fires on a bare expect(x) statement with no matcher", () => {
  const ctx = ctxFor('test("bare", () => {\n  expect(1);\n});\n');
  expect(messagesFor("bare `expect(x);`", ctx).length).toBeGreaterThan(0);
});

test("rule 3 does NOT fire on a matcher-chained expect", () => {
  const ctx = ctxFor('test("chained", () => {\n  expect(1).toBe(1);\n});\n');
  expect(messagesFor("bare `expect(x);`", ctx)).toEqual([]);
});

// ── Rule 4: empty describe ───────────────────────────────────────────────────────────────────────

test("rule 4 fires on a describe() with no nested test/it", () => {
  const ctx = ctxFor('describe("a suite", () => {\n  const x = 1;\n});\n');
  expect(messagesFor("no nested test()/it()", ctx).length).toBeGreaterThan(0);
});

test("rule 4 does NOT fire on a describe() with a nested test", () => {
  const ctx = ctxFor(
    'describe("a suite", () => {\n  test("inner", () => {\n    expect(1).toBe(1);\n  });\n});\n',
  );
  expect(messagesFor("no nested test()/it()", ctx)).toEqual([]);
});

// ── Rule 5: empty lifecycle hook ─────────────────────────────────────────────────────────────────

test("rule 5 fires on an empty beforeEach body", () => {
  const ctx = ctxFor("beforeEach(() => {});\n");
  expect(messagesFor("empty body", ctx).length).toBeGreaterThan(0);
});

test("rule 5 does NOT fire on a beforeEach with a body", () => {
  const ctx = ctxFor("beforeEach(() => {\n  doSetup();\n});\n");
  expect(messagesFor("empty body", ctx)).toEqual([]);
});

// ── File-suffix scope ────────────────────────────────────────────────────────────────────────────

test("ignores non-test files even under tests/", () => {
  const ctx = ctxFor("export const helper = () => 1;\n", "tests/support/helper.ts");
  expect(auditClientTests.run(ctx)).toEqual([]);
});

test("ignores .ct.tsx (Playwright CT lane — audited elsewhere per the gate's header)", () => {
  const ctx = ctxFor('test("mounts", () => {\n  const x = 1;\n});\n', "tests/ui/button.ct.tsx");
  expect(auditClientTests.run(ctx)).toEqual([]);
});

test("covers .int.test.ts (suffix still ends in .test.ts)", () => {
  const ctx = ctxFor(
    'test("int no assert", async () => {\n  await Promise.resolve();\n});\n',
    "tests/server/domain/x.int.test.ts",
  );
  expect(messagesFor("no descendant expect", ctx).length).toBeGreaterThan(0);
});
