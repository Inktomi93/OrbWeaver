// THE LYING-TOOL PIN for `pnpm test:scoped` / `pnpm test:ct` (#1192) — driven through the REAL cli, in
// both directions, because the defect was never in a pure function: it was that the front door forwarded
// a path claim to a runner that answers an unmatched filter with silence.
//
// RED-FIRST, on the unmodified tree (the bare package.json rows, before `cli.ts scoped-test` existed):
//   pnpm test:ct corpus-list-header.ct.tsx corpus-context-header.ct.tsx \
//                  tests/client/features/discovery/components/character-library-surface.ct.tsx --workers=2
//     → `CT SUMMARY — PASS  ·  4 passed · 0 failed`, exit 0. The third path does not exist (the real file
//       is tests/client/features/character/surfaces/…), and the run named it NOWHERE. That is the shape
//       that certified a merge floor over a file nobody opened.
//   pnpm test:scoped tests/tooling/smoke.test.ts tests/tooling/nope-does-not-exist.test.ts --maxWorkers=4
//     → `Test Files 1 passed (1)`, exit 0.
// AFTER, same invocations: exit 3, `ARG ERROR    not under the repo or nonexistent: …<the one bad path>`.
//
// The cases below use the NODE runner for the arms that must actually reach a runner, because a CT
// collection pass costs a chromium-config load; the CT arm is proven at the refusal tier, where the point
// is that NOTHING is spawned at all. The near-miss's own three-path shape (two real + one stale) is a case
// here on purpose: the defect was never a single bad path, it was a bad path HIDDEN AMONG GOOD ONES.
import process from "node:process";
import { acquireCtRunnerLock } from "../../../../tooling/src/verify/lib/ct-runner-lock.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const REAL_A = "tests/tooling/smoke.test.ts";
/** A real FILE under tests/ that declares no test — the BARREN class, not the UNRESOLVED one. */
const REAL_NO_TESTS = "tests/tooling/_support.ts";
const RELATED_SOURCE = "packages/contracts/src/assets/index.ts";
const RELATED_TEST = "tests/contracts/assets/index.contract.test.ts";
const RELATED_EMPTY_SOURCE = "tooling/src/verify/lib/exit-classifiers.ts";
const RELATED_DIRECTORY = "tooling/src/verify/lib";
/** The path the 2026-09-02 merge floor actually named. It has never existed. */
const STALE_CT = "tests/client/features/discovery/components/character-library-surface.ct.tsx";
const REAL_CT_A = "tests/client/features/discovery/components/corpus-list-header.ct.tsx";
const REAL_CT_B = "tests/client/features/discovery/components/corpus-context-header.ct.tsx";

/** A refusal must be fast — it happens before any runner spawn — but a collection pass spawns vitest. */
const REFUSAL_TIMEOUT_MS = scaledBudget(30_000);
const COLLECT_TIMEOUT_MS = scaledBudget(120_000);

test("the near-miss shape: one stale CT path among two real ones REFUSES as misuse", { timeout: REFUSAL_TIMEOUT_MS }, async ({ runCli, plantedTree }) => {
  const root = await plantedTree({ [REAL_CT_A]: "export {};\n", [REAL_CT_B]: "export {};\n" });
  const res = await runCli("verify", ["scoped-test", "ct", REAL_CT_A, REAL_CT_B, STALE_CT, "--workers=2"], { cwd: root, timeoutMs: REFUSAL_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr, "the refusal NAMES the unresolved path").toContain(STALE_CT);
  expect(res.stderr, "and does not accuse the paths that are fine").not.toContain(REAL_CT_A);
  expect(res.stdout, "nothing was run — no summary line can exist").not.toContain("CT SUMMARY");
});

test("the vitest twin: a stale path beside a real one REFUSES as misuse", { timeout: REFUSAL_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", REAL_A, "tests/tooling/nope-does-not-exist.test.ts"], { timeoutMs: REFUSAL_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("nope-does-not-exist.test.ts");
  expect(res.stdout, "the good path must NOT have been run behind the bad one").not.toContain("Test Files");
});

test("a REAL file the runner collects no tests from is a DIFFERENT fault and a different exit code", { timeout: COLLECT_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", REAL_A, REAL_NO_TESTS], { timeoutMs: COLLECT_TIMEOUT_MS });
  // 2, not 3: the argv is well-formed, so this is not misuse — it is "the run is NOT a verdict about that
  // file", which is exactly what the house reserves toolError for.
  await expect(res).toExitWith(2);
  expect(res.stderr).toContain(REAL_NO_TESTS);
  expect(res.stderr, "the two faults must not share a sentence").toContain("collected NO tests");
  expect(res.stderr).not.toContain("nonexistent");
});

test("the passing direction: a real path with real tests still runs and exits clean", { timeout: COLLECT_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", REAL_A, "--maxWorkers=2"], { timeoutMs: COLLECT_TIMEOUT_MS });
  await expect(res).toExitWith(0);
  expect(res.stdout + res.stderr, "the preflight delegates — it does not replace the runner").toContain(REAL_A);
});

test("the related-source direction reaches a real runtime test through the supervised door", { timeout: COLLECT_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", "--related", RELATED_SOURCE, RELATED_TEST, "--project", "contract"], {
    timeoutMs: COLLECT_TIMEOUT_MS,
  });
  await expect(res).toExitWith(0);
  expect(res.stdout + res.stderr).toContain(RELATED_TEST);
});

test("a source with zero runtime dependents is a visible legitimate derived empty", { timeout: COLLECT_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", "--related", RELATED_EMPTY_SOURCE, "--project", "contract"], {
    timeoutMs: COLLECT_TIMEOUT_MS,
  });
  await expect(res).toExitWith(0);
  expect(res.stdout + res.stderr).toContain("No test files found, exiting with code 0");
});

test("--related refuses a directory before native collection or execution", { timeout: REFUSAL_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", "--related", RELATED_DIRECTORY], { timeoutMs: REFUSAL_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain(`--related accepts source files, not directories: ${RELATED_DIRECTORY}`);
  expect(res.stderr).toContain("use verify --scope <folder> or name explicit source files");
  expect(res.stdout + res.stderr).not.toContain("No test files found");
  expect(res.stdout + res.stderr).not.toContain("RUN  v");
});

test("--related forwards a native --dir directory value instead of treating it as a source operand", { timeout: COLLECT_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "node", "--related", RELATED_EMPTY_SOURCE, "--dir", RELATED_DIRECTORY, "--project", "contract"], {
    timeoutMs: COLLECT_TIMEOUT_MS,
  });
  await expect(res).toExitWith(0);
  expect(res.stderr).not.toContain("accepts source files, not directories");
  expect(res.stdout + res.stderr).toContain("No test files found, exiting with code 0");
});

// ── #1581: a second CT runner in ONE worktree refuses INSTEAD of racing ──────────────────────────────
//
// The defect measured 2026-09-04: both runners cleared and rebuilt the SAME `playwright/.cache`, so the
// first reported reds in files it never touched (201/2, then 203/203 alone at the same load). The lock is
// the cheap guard in front of the per-invocation cache; this arm proves the refusal happens at the front
// door — no collection pass, no chromium, no CT SUMMARY. The mechanism's own directions (stale steal,
// distinct cache dirs, release) are pinned in tests/tooling/verify/lib/ct-runner-lock.test.ts.
test("a CT run refuses (exit 2) while another test:ct holds this worktree", { timeout: REFUSAL_TIMEOUT_MS }, async ({ runCli, plantedTree }) => {
  const root = await plantedTree({ [REAL_CT_A]: "export {};\n" });
  // THIS test process stands in for the live sibling: a real pid, so the child's liveness probe says yes.
  const held = acquireCtRunnerLock(root, { argv: ["(the #1581 pin)"] });
  if (held.kind !== "held") {
    throw new Error("#1581 pin: the isolated fixture lock was unexpectedly held");
  }
  try {
    const res = await runCli("verify", ["scoped-test", "ct", REAL_CT_A, "--workers=2"], { cwd: root, timeoutMs: REFUSAL_TIMEOUT_MS });
    await expect(res).toExitWith(2);
    expect(res.stderr).toContain("CT RUNNER BUSY");
    expect(res.stderr, "the refusal names the pid holding the tree").toContain(`pid ${String(process.pid)}`);
    expect(res.stdout, "nothing was built and nothing ran").not.toContain("CT SUMMARY");
  } finally {
    held.lease.release();
  }
});

test("an unknown runner name is misuse, and the refusal names the real ones", { timeout: REFUSAL_TIMEOUT_MS }, async ({ runCli }) => {
  const res = await runCli("verify", ["scoped-test", "vitest", REAL_A], { timeoutMs: REFUSAL_TIMEOUT_MS });
  await expect(res).toExitWith(3);
  expect(res.stderr).toContain("node|ct");
});
