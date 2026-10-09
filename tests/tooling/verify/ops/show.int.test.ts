// `cli.ts show` — the ONE read-don't-rerun door, driven as a real CLI. Two halves live here:
//   · the STRUCTURE view's argv + exit contract (the original cases, below);
//   · the PUBLISHED-ARTIFACT READER (#2502) — `--stage`/`--stages`/`--run`/`--pointers`.
//
// THE #2502 DEFECT. `reports/…` paths are `latest` POINTERS published only when a run FINISHES (#1029), and
// the WRITE side of that layout was centralized while the READ side was not: every consumer hand-pathed
// `reports/verify/<stage>.log` and none of them asked whose run it was. Three misattributions on
// 2026-09-20, all of that alias; and `reports/test-report-tooling.json` sat on a 2026-09-13 slot for a week
// while every `tests:tooling` verdict was read as a run that had happened.
//
// WHY A SPAWNED CLI AND A PLANTED TREE. The unit under test is a decision about the FILESYSTEM — a symlink,
// a slot dir, an `.inflight` marker's pid — and the resolver reads `process.cwd()` as its root, so the tree
// IS the input. The planted trees carry real-shaped run ids (`<checkout>-<pid>-<stamp>`), because the
// resolver derives a run's instant from that stamp.
//
// BOTH DIRECTIONS, EVERY ARM. Each refusal case has the matching case that must NOT refuse beside it: a
// stale pointer against a fresh one, an in-flight run against a finished one, and — the one that would have
// made this instrument lie — a run that FINISHED AND PUBLISHED NOTHING (`closeRunSlot`, the fixture-mode
// and gate-scoped `check:structure` path) which must NOT make a live pointer read stale.
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
import type { VerifyReport } from "../../../../tooling/src/verify/contract/stage.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

vi.setConfig({ testTimeout: scaledBudget(30_000) });

async function reportTree(plantedTree: (files: Record<string, string>) => Promise<string>, report: object): Promise<string> {
  return await plantedTree({ "reports/check-structure.json": `${JSON.stringify(report)}\n` });
}

const brokenReport = {
  gates: [{ name: "broken-gate", ok: true, violations: [] }],
  toolErrors: [{ gate: "broken-gate", phase: "run", message: "planted checker crash" }],
  scanAlarms: [],
  total: 0,
  ok: false,
};

test("a filtered show view preserves tool-error exit 2", async ({ plantedTree, runCli }) => {
  const root = await reportTree(plantedTree, brokenReport);
  const result = await runCli("verify", ["show", "--gate", "broken"], { cwd: root });
  await expect(result).toExitWith(EXIT.toolError);
  expect(result.stdout).toContain("TOOL ERROR");
});

for (const argv of [["--unknown"], ["--gate"], ["--file"], ["--limit", "0"], ["--limit", "wat"]]) {
  test(`invalid show argv ${JSON.stringify(argv)} exits misuse`, async ({ plantedTree, runCli }) => {
    const root = await reportTree(plantedTree, brokenReport);
    const result = await runCli("verify", ["show", ...argv], { cwd: root });
    await expect(result).toExitWith(EXIT.misuse);
  });
}

test("a valid filter over an ordinary violation remains an inspection view", async ({ plantedTree, runCli }) => {
  const root = await reportTree(plantedTree, {
    gates: [{ name: "dirty-gate", ok: false, violations: [{ file: "x.ts", line: 1, message: "violation" }] }],
    toolErrors: [],
    scanAlarms: [],
    total: 1,
    ok: false,
  });
  const result = await runCli("verify", ["show", "--gate", "dirty"], { cwd: root });
  await expect(result).toExitWith(EXIT.clean);
});

// ── THE PUBLISHED-ARTIFACT READER (#2502) ──────────────────────────────────────────────────────────

const OLD_RUN = "main-111-2026-09-20T10-00-00-000Z";
const NEW_RUN = "main-222-2026-09-20T11-00-00-000Z";
const LIVE_RUN = "main-333-2026-09-20T12-00-00-000Z";
/** A pid that is certainly not alive: above Linux's default `pid_max` (4194304), so `pidAlive` answers
 *  false without the test ever having to kill anything. */
const DEAD_PID = 2_147_483_640;

/** A verify run's artifact, as `ops/run.ts` writes it — one stage with a transcript, one deferred stage
 *  that legitimately has none. `logFile` is REPO-RELATIVE inside the slot, which is how the reader finds a
 *  transcript without re-deriving the `<stage>.log` filename convention from the writer. */
function verifyReport(runId: string): string {
  return JSON.stringify({
    tier: "static",
    scope: "whole",
    run: {
      runId,
      checkout: "main",
      artifactDir: `reports/runs/verify/${runId}`,
      startedAt: "2026-09-20T10:00:00.000Z",
      finishedAt: "2026-09-20T10:05:00.000Z",
      concurrent: [],
    },
    ok: true,
    exitCode: 0,
    failed: 0,
    noVerdict: [],
    stages: [
      {
        name: "lint:biome",
        group: "lint",
        mode: "full",
        ok: true,
        exitCode: 0,
        childExit: 0,
        durationMs: 3210,
        logFile: `reports/runs/verify/${runId}/stages/lint-biome.log`,
        failureExcerpt: null,
        runsAt: null,
        notices: [],
      },
      {
        name: "tests:node",
        group: "test",
        mode: "deferred",
        ok: true,
        exitCode: 0,
        durationMs: 0,
        logFile: null,
        failureExcerpt: null,
        runsAt: "--push",
        notices: [],
      },
    ],
  });
}

const TRANSCRIPT = "[stage lint-biome] planted transcript\nChecked 1200 files in 3s.\nlint-biome: no findings\n";

/** The files a FINISHED, PUBLISHING verify run leaves in its slot. `.published` non-empty is what gives a
 *  run standing to be "the newest complete run" a pointer is judged against. */
function publishedSlot(runId: string): Readonly<Record<string, string>> {
  return {
    [`reports/runs/verify/${runId}/verify.json`]: verifyReport(runId),
    [`reports/runs/verify/${runId}/stages/lint-biome.log`]: TRANSCRIPT,
    [`reports/runs/verify/${runId}/.published`]: '["verify.json","verify"]\n',
  };
}

/** Publish the two aliases `ops/run.ts` publishes, exactly as `publishSymlink` does: RELATIVE links from
 *  `reports/` into the slot. */
function publish(root: string, runId: string): void {
  symlinkSync(join("runs", "verify", runId, "verify.json"), join(root, "reports", "verify.json"));
  symlinkSync(join("runs", "verify", runId, "stages"), join(root, "reports", "verify"));
}

test("a FRESH pointer resolves, names its run, and serves the stage transcript", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(publishedSlot(OLD_RUN));
  publish(root, OLD_RUN);

  const listed = await runCli("verify", ["show", "--stages"], { cwd: root });
  await expect(listed).toExitWith(EXIT.clean);
  expect(listed.stdout).toContain(`(run ${OLD_RUN} → reports/runs/verify/${OLD_RUN})`);
  expect(listed.stdout).toContain("lint:biome");

  const one = await runCli("verify", ["show", "--stage", "lint:biome"], { cwd: root });
  await expect(one).toExitWith(EXIT.clean);
  // THE POINT OF THE WHOLE VERB: the transcript nobody read without hand-pathing the alias.
  expect(one.stdout).toContain("lint-biome: no findings");
  expect(one.stdout).toContain(`(run ${OLD_RUN} → reports/runs/verify/${OLD_RUN})`);
  // …and the provenance is the FIRST line, so a reader cannot consume the body without it.
  expect(one.stdout.split("\n")[0]).toContain(`run ${OLD_RUN}`);
});

test("a stage that ran NO CHILD says so at exit 0 rather than reporting a missing transcript", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(publishedSlot(OLD_RUN));
  publish(root, OLD_RUN);

  const deferred = await runCli("verify", ["show", "--stage", "tests:node"], { cwd: root });
  await expect(deferred).toExitWith(EXIT.clean);
  expect(deferred.stdout).toContain("deferred");
  expect(deferred.stdout).toContain("it runs at --push");
});

test("a STALE pointer is NAMED as stale and still served — never silently passed off as current", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({ ...publishedSlot(OLD_RUN), ...publishedSlot(NEW_RUN) });
  publish(root, OLD_RUN); // the alias was never re-aimed at NEW_RUN — the week-dark shape

  const listed = await runCli("verify", ["show", "--stages"], { cwd: root });
  await expect(listed).toExitWith(EXIT.clean);
  expect(listed.stdout).toContain("STALE POINTER");
  expect(listed.stdout).toContain(NEW_RUN);
  expect(listed.stdout).toContain("lint:biome"); // named, AND still served
});

test("a run that FINISHED AND PUBLISHED NOTHING does not make a live pointer read stale", async ({ runCli, plantedTree }) => {
  // THE FALSE-POSITIVE CONTROL, and it is not hypothetical: `closeRunSlot` writes an explicit empty
  // `.published` for a fixture-mode or gate-scoped `check:structure` (tooling/src/verify/ops/structure.ts),
  // which the #1584 program runs constantly. Counting such a run as "the newest complete run" would have
  // made every published pointer on the tree report STALE — an instrument lying in the loud direction.
  const root = await plantedTree({
    ...publishedSlot(OLD_RUN),
    [`reports/runs/verify/${NEW_RUN}/verify.json`]: verifyReport(NEW_RUN),
    [`reports/runs/verify/${NEW_RUN}/.published`]: "[]\n",
  });
  publish(root, OLD_RUN);

  const listed = await runCli("verify", ["show", "--stages"], { cwd: root });
  await expect(listed).toExitWith(EXIT.clean);
  expect(listed.stdout).not.toContain("STALE POINTER");
});

test("an IN-FLIGHT run REFUSES the read (exit 2) and names the --run door out of it", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...publishedSlot(OLD_RUN),
    // A LIVE writer: the marker's pid is THIS process, which is certainly alive.
    [`reports/runs/verify/${LIVE_RUN}/.inflight`]: JSON.stringify({
      runId: LIVE_RUN,
      pid: process.pid,
      checkout: "main",
      startedAt: "2026-09-20T12:00:00.000Z",
    }),
  });
  publish(root, OLD_RUN);

  const refused = await runCli("verify", ["show", "--stage", "lint:biome"], { cwd: root });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("IN FLIGHT");
  expect(refused.stdout).toContain(LIVE_RUN);
  // A refusal with no way forward is a dead end; the door is part of the contract.
  const escaped = await runCli("verify", ["show", "--stage", "lint:biome", "--run", OLD_RUN], { cwd: root });
  await expect(escaped).toExitWith(EXIT.clean);
  expect(escaped.stdout).toContain("lint-biome: no findings");
});

test("a run that DIED after the published one REFUSES the read", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...publishedSlot(OLD_RUN),
    [`reports/runs/verify/${LIVE_RUN}/.inflight`]: JSON.stringify({ runId: LIVE_RUN, pid: DEAD_PID, checkout: "main", startedAt: "2026-09-20T12:00:00.000Z" }),
  });
  publish(root, OLD_RUN);

  const refused = await runCli("verify", ["show", "--stages"], { cwd: root });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("NEVER FINISHED");
});

test("a DANGLING pointer refuses instead of reading as an absent artifact", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(publishedSlot(OLD_RUN));
  symlinkSync(join("runs", "verify", "main-999-2026-09-20T13-00-00-000Z", "verify.json"), join(root, "reports", "verify.json"));

  const refused = await runCli("verify", ["show", "--stages"], { cwd: root });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("DANGLING POINTER");
});

test("a REAL FILE at the alias refuses: no run owns it, so its provenance cannot be established", async ({ runCli, plantedTree }) => {
  // Every pre-#1029 artifact is a real file at the well-known path, and so is anything a human copied over
  // the alias. It PARSES and it looks exactly like a verdict — which is why it has to refuse rather than be
  // served under a fabricated run id.
  const root = await plantedTree({ ...publishedSlot(OLD_RUN), "reports/verify.json": verifyReport(OLD_RUN) });

  const refused = await runCli("verify", ["show", "--stages"], { cwd: root });
  await expect(refused).toExitWith(EXIT.toolError);
  expect(refused.stdout).toContain("NOT A POINTER");
});

test("--pointers names an UNMOVED alias as stale and exits 1 — the week-dark case", async ({ runCli, plantedTree }) => {
  // TWO ALIASES OF ONE INSTRUMENT, published by different runs — exactly `test-report.json` (moved every
  // product run) beside `test-report-tooling.json` (frozen since 2026-09-13). The fresh one is the control:
  // a view that flagged both would be measuring nothing.
  const old = "main-111-2026-09-13T14-52-40-820Z";
  const fresh = "main-222-2026-09-20T23-19-15-717Z";
  const root = await plantedTree({
    [`reports/runs/test/${old}/test-report.json`]: "{}",
    [`reports/runs/test/${old}/.published`]: '["test-report-tooling.json"]\n',
    [`reports/runs/test/${fresh}/test-report.json`]: "{}",
    [`reports/runs/test/${fresh}/.published`]: '["test-report.json"]\n',
  });
  symlinkSync(join("runs", "test", old, "test-report.json"), join(root, "reports", "test-report-tooling.json"));
  symlinkSync(join("runs", "test", fresh, "test-report.json"), join(root, "reports", "test-report.json"));

  const view = await runCli("verify", ["show", "--pointers"], { cwd: root });
  await expect(view).toExitWith(EXIT.violations);
  expect(view.stdout).toContain("test-report-tooling.json");
  expect(view.stdout).toContain("STALE POINTER");
  // The FRESH alias is not flagged, and the scanned count rides the verdict so a zero is never mute.
  expect(view.stdout).toContain("1/2 pointer(s) do NOT serve");
  expect(view.stdout).toContain("2 published pointer(s)");
});

test("--pointers REFUSES on a checkout with nothing published rather than printing a clean zero", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({ "reports/README.md": "no runs here\n" });
  mkdirSync(join(root, "reports", "runs"), { recursive: true });

  const refused = await runCli("verify", ["show", "--pointers"], { cwd: root });
  await expect(refused).toExitWith(EXIT.misuse);
  expect(refused.stderr + refused.stdout).toContain("NOTHING TO MEASURE");
});

// ONE SPAWNED CLI PER TEST from here down: each `runCli` is a cold node start (~1.5s) and three of them in
// one case ran the 5s default timeout out — a flake nobody would have read as an argv assertion.
test("a stage flag and a gate flag name DIFFERENT artifacts, so asking for both is misuse", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(publishedSlot(OLD_RUN));
  publish(root, OLD_RUN);

  const mixed = await runCli("verify", ["show", "--stage", "lint:biome", "--gate", "tooling-size"], { cwd: root });
  await expect(mixed).toExitWith(EXIT.misuse);
});

test("--stage and --stages are one stage and all of them, so asking for both is misuse", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(publishedSlot(OLD_RUN));
  publish(root, OLD_RUN);

  const both = await runCli("verify", ["show", "--stage", "lint:biome", "--stages"], { cwd: root });
  await expect(both).toExitWith(EXIT.misuse);
});

test("an unknown stage name answers with the names that DO exist, rather than an empty view", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(publishedSlot(OLD_RUN));
  publish(root, OLD_RUN);

  const unknown = await runCli("verify", ["show", "--stage", "nonsuch"], { cwd: root });
  await expect(unknown).toExitWith(EXIT.misuse);
  expect(unknown.stderr + unknown.stdout).toContain("lint:biome, tests:node");
});

// ── THE FAILED-VERIFY-RUN SUMMARY (docs/work item 0267) ────────────────────────────────────────────
//
// THE DEFECT THIS CLOSES. `--errors-only` (and the bare default) read ONLY `reports/check-structure.json`.
// After a `pnpm verify --push` whose `tests:node`/`browser:ct`/`browser:e2e-smoke`/`deps:orphan-ratchet`/
// `quality:boot-chunk` stages failed but whose structure gates happened to be clean, the reader printed a
// green structure verdict and nothing else — a false clean nobody reading only `check:show` could catch.

const FAIL_RUN = "main-444-2026-09-29T12-00-00-000Z";
const NEWER_COMPLETE_RUN = "main-555-2026-09-29T13-00-00-000Z";

function failingVerifyReport(runId: string): string {
  return JSON.stringify({
    tier: "push",
    scope: "whole",
    run: {
      runId,
      checkout: "main",
      artifactDir: `reports/runs/verify/${runId}`,
      startedAt: "2026-09-29T12:00:00.000Z",
      finishedAt: "2026-09-29T12:30:00.000Z",
      concurrent: [],
    },
    ok: false,
    exitCode: 1,
    failed: 6,
    noVerdict: [],
    stages: [
      {
        name: "lint:biome",
        group: "lint",
        mode: "full",
        ok: true,
        exitCode: 0,
        childExit: 0,
        durationMs: 100,
        logFile: `reports/runs/verify/${runId}/stages/lint-biome.log`,
        failureExcerpt: null,
        runsAt: null,
        notices: [],
      },
      {
        name: "structure:full",
        group: "structure",
        mode: "full",
        ok: false,
        exitCode: 1,
        childExit: 1,
        durationMs: 150,
        logFile: `reports/runs/verify/${runId}/stages/structure-full.log`,
        failureExcerpt: "check:structure FAILED — 1 violation(s)",
        runsAt: null,
        notices: [],
      },
      {
        name: "tests:node",
        group: "tests",
        mode: "full",
        ok: false,
        exitCode: 1,
        childExit: 1,
        durationMs: 200,
        logFile: `reports/runs/verify/${runId}/stages/tests-node.log`,
        failureExcerpt: "Test Files  1 failed | 1 passed (2)",
        runsAt: null,
        notices: [],
      },
      {
        name: "browser:ct",
        group: "browser",
        mode: "full",
        ok: false,
        exitCode: 1,
        childExit: 1,
        durationMs: 250,
        logFile: `reports/runs/verify/${runId}/stages/browser-ct.log`,
        failureExcerpt: "CT SUMMARY — FAILED",
        runsAt: null,
        notices: [],
      },
      {
        name: "deps:orphan-ratchet",
        group: "deps",
        mode: "full",
        ok: false,
        exitCode: 1,
        childExit: 1,
        durationMs: 50,
        logFile: `reports/runs/verify/${runId}/stages/deps-orphan-ratchet.log`,
        failureExcerpt: "orphan-export-ratchet — 2 unexempted orphan export(s)",
        runsAt: null,
        notices: [],
      },
      {
        name: "quality:boot-chunk",
        group: "quality",
        mode: "full",
        ok: false,
        exitCode: 1,
        childExit: 1,
        durationMs: 60,
        logFile: `reports/runs/verify/${runId}/stages/quality-boot-chunk.log`,
        failureExcerpt: "boot-chunk-ratchet — boot payload over ceiling",
        runsAt: null,
        notices: [],
      },
      {
        name: "browser:e2e-smoke",
        group: "browser",
        mode: "full",
        ok: false,
        exitCode: 1,
        childExit: 1,
        durationMs: 300,
        logFile: `reports/runs/verify/${runId}/stages/browser-e2e-smoke.log`,
        failureExcerpt: "Error: Timed out waiting 180000ms from config.webServer.",
        runsAt: null,
        notices: [],
      },
    ],
  });
}

const STRUCTURE_STAGE_LOG = "$ node tooling/src/verify/cli.ts structure\n✗ some-gate (1 violation)\n  ✗ packages/a/b.ts:1  a planted structure violation\n";
const TESTS_NODE_LOG =
  "some setup\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  |unit| tests/x/y.test.ts > widget renders the roster\nAssertionError: expected 1 to be 2\n\n Test Files  1 failed | 1 passed (2)\n      Tests  1 failed | 1 passed (2)\n";
const CT_LOG =
  "  CT SUMMARY — FAILED  ·  10 passed · 1 failed · 0 flaky · 0 skipped\n  FAILED (1):\n  ✗ tests/client/features/foo.ct.tsx:10  chromium › foo › bar breaks\n";
const ORPHAN_LOG =
  "orphan-export-ratchet — 2 unexempted orphan export(s)\n  ✗ packages/contracts/src/a.ts:1  `Foo` — reached by nobody (prod or test) and unused in its own file\n  ✗ packages/contracts/src/b.ts:2  `Bar` — reached by nobody (prod or test) and unused in its own file\n";
const BOOT_CHUNK_LOG = "boot-chunk-ratchet — boot payload = 100 B (ceiling 90 B)\n  ✗ OVER by 10 B (11.1%)\n";
const E2E_SMOKE_LOG = "[WebServer] dev: booting the server\nError: Timed out waiting 180000ms from config.webServer.\n";

function failingSlot(runId: string): Readonly<Record<string, string>> {
  return {
    [`reports/runs/verify/${runId}/verify.json`]: failingVerifyReport(runId),
    [`reports/runs/verify/${runId}/stages/lint-biome.log`]: "lint-biome: no findings\n",
    [`reports/runs/verify/${runId}/stages/structure-full.log`]: STRUCTURE_STAGE_LOG,
    [`reports/runs/verify/${runId}/stages/tests-node.log`]: TESTS_NODE_LOG,
    [`reports/runs/verify/${runId}/stages/browser-ct.log`]: CT_LOG,
    [`reports/runs/verify/${runId}/stages/deps-orphan-ratchet.log`]: ORPHAN_LOG,
    [`reports/runs/verify/${runId}/stages/quality-boot-chunk.log`]: BOOT_CHUNK_LOG,
    [`reports/runs/verify/${runId}/stages/browser-e2e-smoke.log`]: E2E_SMOKE_LOG,
    [`reports/runs/verify/${runId}/.published`]: '["verify.json","verify"]\n',
    "reports/check-structure.json": JSON.stringify({ gates: [], toolErrors: [], scanAlarms: [], total: 0, ok: true }),
  };
}

function publishVerify(root: string, runId: string): void {
  symlinkSync(join("runs", "verify", runId, "verify.json"), join(root, "reports", "verify.json"));
  symlinkSync(join("runs", "verify", runId, "stages"), join(root, "reports", "verify"));
}

for (const argv of [[], ["--errors-only"]]) {
  test(`a stale red verify alias names the newer completed run in show ${JSON.stringify(argv)}`, async ({ runCli, plantedTree }) => {
    const root = await plantedTree({ ...failingSlot(FAIL_RUN), ...publishedSlot(NEWER_COMPLETE_RUN) });
    publishVerify(root, FAIL_RUN);
    const result = await runCli("verify", ["show", ...argv], { cwd: root });
    await expect(result).toExitWith(EXIT.violations);
    expect(result.stdout).toContain(`STALE POINTER: reports/verify.json still resolves to ${FAIL_RUN}`);
    expect(result.stdout).toContain(`NEWER complete run ${NEWER_COMPLETE_RUN}`);
    expect(result.stdout).toContain("tests:node");
    expect(result.stdout.indexOf("STALE POINTER")).toBeLessThan(result.stdout.indexOf("verify push FAILED"));
  });
}

test("a stale clean verify alias still prints its advisory before the clean structure verdict", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...publishedSlot(OLD_RUN),
    ...publishedSlot(NEW_RUN),
    "reports/check-structure.json": JSON.stringify({ gates: [], toolErrors: [], scanAlarms: [], total: 0, ok: true }),
  });
  publish(root, OLD_RUN);
  const result = await runCli("verify", ["show"], { cwd: root });
  await expect(result).toExitWith(EXIT.clean);
  expect(result.stdout).toContain(`STALE POINTER: reports/verify.json still resolves to ${OLD_RUN}`);
  expect(result.stdout).toContain(`NEWER complete run ${NEW_RUN}`);
  expect(result.stdout).toContain("check:structure passed");
});

test("--errors-only names every failing stage of a red verify run, not only check:structure's", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(failingSlot(FAIL_RUN));
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  // The run failed — a clean exit here would BE the false clean this item closes, even though the
  // structure artifact alone is green.
  await expect(result).toExitWith(EXIT.violations);
  expect(result.stdout).toContain(`run ${FAIL_RUN}`);
  expect(result.stdout).toContain("structure:full");
  expect(result.stdout).toContain("a planted structure violation");
  expect(result.stdout).toContain("tests:node");
  expect(result.stdout).toContain("FAIL  |unit| tests/x/y.test.ts > widget renders the roster");
  expect(result.stdout).toContain("browser:ct");
  expect(result.stdout).toContain("tests/client/features/foo.ct.tsx:10  chromium › foo › bar breaks");
  expect(result.stdout).toContain("deps:orphan-ratchet");
  expect(result.stdout).toContain("`Foo` — reached by nobody");
  expect(result.stdout).toContain("`Bar` — reached by nobody");
  expect(result.stdout).toContain("quality:boot-chunk");
  expect(result.stdout).toContain("OVER by 10 B");
  expect(result.stdout).toContain("browser:e2e-smoke");
  expect(result.stdout).toContain("Timed out waiting 180000ms from config.webServer.");
  // The one PASSING stage stays out of the failure summary.
  expect(result.stdout).not.toMatch(/✗ lint:biome/u);
});

test("the bare default also names every failing stage of a red verify run", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(failingSlot(FAIL_RUN));
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show"], { cwd: root });
  await expect(result).toExitWith(EXIT.violations);
  expect(result.stdout).toContain("tests:node");
  expect(result.stdout).toContain("browser:e2e-smoke");
});

test("a failing stage's lines are capped with a count and the widening flag", async ({ runCli, plantedTree }) => {
  const root = await plantedTree(failingSlot(FAIL_RUN));
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only", "--limit", "1"], { cwd: root });
  expect(result.stdout).toContain("…and 1 more (pnpm check:show --stage deps:orphan-ratchet to widen)");
});

function checkStructureAt(runId: string, startedAt: string): string {
  return JSON.stringify({
    run: { runId, complete: true, ran: 1, active: 1, startedAt },
    gates: [],
    toolErrors: [],
    scanAlarms: [],
    total: 0,
    ok: true,
  });
}

test("check:show says whether the structure verdict is from this verify run or an older one", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    "reports/check-structure.json": checkStructureAt("main-1-2026-09-01T00-00-00-000Z", "2026-09-01T00:00:00.000Z"),
  });
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  expect(result.stdout).toContain("structure verdict is from an OLDER run (main-1-2026-09-01T00-00-00-000Z");
  expect(result.stdout).toContain(`before this verify run (${FAIL_RUN}) started`);
});

test("check:show says a structure run AFTER the verify run finished is NEWER, not older", async ({ runCli, plantedTree }) => {
  // The verify run's window is [12:00:00, 12:30:00] (failingVerifyReport) — a structure run that started
  // an hour after it finished is not "older": the original two-way compare mislabeled every post-window
  // run as OLDER.
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    "reports/check-structure.json": checkStructureAt("main-9-2026-09-29T13-30-00-000Z", "2026-09-29T13:30:00.000Z"),
  });
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  expect(result.stdout).toContain("structure verdict is from a NEWER run (main-9-2026-09-29T13-30-00-000Z");
  expect(result.stdout).toContain(`after this verify run (${FAIL_RUN}) finished`);
});

test("check:show says a structure run inside the verify window started DURING it, without claiming it IS that stage", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    "reports/check-structure.json": checkStructureAt("main-5-2026-09-29T12-15-00-000Z", "2026-09-29T12:15:00.000Z"),
  });
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  expect(result.stdout).toContain("structure verdict is from a run (main-5-2026-09-29T12-15-00-000Z) started DURING this verify run");
  expect(result.stdout).toContain("not necessarily its own structure:full stage");
});

test("--gate keeps the narrow structure-only view even when the verify run failed", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    "reports/check-structure.json": JSON.stringify({
      gates: [{ name: "dirty-gate", ok: false, violations: [{ file: "x.ts", line: 1, message: "violation" }] }],
      toolErrors: [],
      scanAlarms: [],
      total: 1,
      ok: false,
    }),
  });
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--gate", "dirty"], { cwd: root });
  expect(result.stdout).not.toContain("stage(s) failed");
  expect(result.stdout).not.toContain("tests:node");
});

test("a clean verify run adds nothing to the structure view", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...publishedSlot(OLD_RUN),
    "reports/check-structure.json": JSON.stringify({ gates: [], toolErrors: [], scanAlarms: [], total: 0, ok: true }),
  });
  publish(root, OLD_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  await expect(result).toExitWith(EXIT.clean);
  expect(result.stdout).not.toContain("stage(s) failed");
  expect(result.stdout).toContain("check:structure passed");
  // No `--gate`/`--file` was given — "(filter view)" would falsely claim this is a narrowed inspection.
  expect(result.stdout).not.toContain("(filter view)");
});

test('the bare default drops "(filter view)" from a clean structure header when a red verify run forced the gate list open', async ({
  runCli,
  plantedTree,
}) => {
  const root = await plantedTree(failingSlot(FAIL_RUN));
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show"], { cwd: root });
  expect(result.stdout).toContain("✓ check:structure passed");
  expect(result.stdout).not.toContain("(filter view)");
});

test("an ABANDONED latest verify run gets a one-line advisory instead of a silent fall-through, and exits toolError", async ({ runCli, plantedTree }) => {
  // Same shape as the existing "a run that DIED after the published one REFUSES the read" --stage case
  // (show-stage.ts's own precedent): a `.inflight` marker whose pid is certainly dead.
  const root = await plantedTree({
    ...publishedSlot(OLD_RUN),
    "reports/check-structure.json": JSON.stringify({ gates: [], toolErrors: [], scanAlarms: [], total: 0, ok: true }),
    [`reports/runs/verify/${LIVE_RUN}/.inflight`]: JSON.stringify({ runId: LIVE_RUN, pid: DEAD_PID, checkout: "main", startedAt: "2026-09-20T12:00:00.000Z" }),
  });
  publish(root, OLD_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  await expect(result).toExitWith(EXIT.toolError);
  expect(result.stdout).toContain("NEVER FINISHED");
  expect(result.stdout).toContain(LIVE_RUN);
  // The structure verdict still renders beneath the advisory — this is a notice, not a silent fall-through.
  expect(result.stdout).toContain("check:structure passed");
});

test("an UNPARSEABLE verify.json gets a one-line advisory instead of a silent fall-through, and exits toolError", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    [`reports/runs/verify/${OLD_RUN}/verify.json`]: "{not json",
    [`reports/runs/verify/${OLD_RUN}/.published`]: '["verify.json","verify"]\n',
    "reports/check-structure.json": JSON.stringify({ gates: [], toolErrors: [], scanAlarms: [], total: 0, ok: true }),
  });
  publish(root, OLD_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  await expect(result).toExitWith(EXIT.toolError);
  expect(result.stdout).toContain(`reports/verify.json resolves to ${OLD_RUN} but will not parse`);
  expect(result.stdout).toContain("check:structure passed");
});

test("a red stage with an empty log says so, rather than printing only the header", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    [`reports/runs/verify/${FAIL_RUN}/stages/deps-orphan-ratchet.log`]: "",
  });
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only"], { cwd: root });
  expect(result.stdout).toContain(
    "deps:orphan-ratchet (exit 1)\n  (this stage's log is empty — no output was captured — pnpm check:show --stage deps:orphan-ratchet)",
  );
});

test("the fallback tail (no extractor matched) reports how many lines it dropped", async ({ runCli, plantedTree }) => {
  const many = Array.from({ length: 30 }, (_, i) => `plain line ${i}`).join("\n");
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    [`reports/runs/verify/${FAIL_RUN}/stages/quality-boot-chunk.log`]: many,
  });
  publishVerify(root, FAIL_RUN);

  const result = await runCli("verify", ["show", "--errors-only", "--limit", "3"], { cwd: root });
  // The last 3 lines (a tail), and an honest count of how many were dropped ahead of them.
  expect(result.stdout).toContain("plain line 29");
  expect(result.stdout).toContain("…and 27 more (pnpm check:show --stage quality:boot-chunk to widen)");
});

test("an interrupted Vitest stage names real failing suites and cases instead of fixture diagnostics", async ({ runCli, plantedTree }) => {
  const root = await plantedTree({
    ...failingSlot(FAIL_RUN),
    [`reports/runs/verify/${FAIL_RUN}/stages/tests-node.log`]: [
      "  ✗ 1 final policy REGRESSED: fixture-alpha",
      " ❯ |tooling| tests/tooling/actual.test.ts (3 tests | 1 failed) 120ms",
      "   ✓ a passing control 10ms",
      "   × the real failing case 110ms",
      "[proc] TIMED OUT after 2700000ms — killed the process group of pid 123",
    ].join("\n"),
  });
  publishVerify(root, FAIL_RUN);
  const result = await runCli("verify", ["show", "--errors-only", "--limit", "100"], { cwd: root });
  await expect(result).toExitWith(EXIT.violations);
  expect(result.stdout).toContain("tests/tooling/actual.test.ts (3 tests | 1 failed)");
  expect(result.stdout).toContain("the real failing case");
  expect(result.stdout).toContain("[proc] TIMED OUT");
  expect(result.stdout).not.toContain("fixture-alpha");
  expect(result.stdout).not.toContain("a passing control");
  expect(result.stdout).toContain("a planted structure violation");
});

test("--stages renders every runtime failure transcript without requiring a structure report", async ({ runCli, plantedTree }) => {
  const files = Object.fromEntries(Object.entries(failingSlot(FAIL_RUN)).filter(([path]) => path !== "reports/check-structure.json"));
  const root = await plantedTree(files);
  publishVerify(root, FAIL_RUN);
  const result = await runCli("verify", ["show", "--stages", "--limit", "20"], { cwd: root });
  await expect(result).toExitWith(EXIT.violations);
  expect(result.stderr).not.toContain("couldn't read");
  for (const detail of [
    "a planted structure violation",
    "widget renders the roster",
    "bar breaks",
    "reached by nobody",
    "OVER by 10 B",
    "Timed out waiting 180000ms",
  ]) {
    expect(result.stdout).toContain(detail);
  }
  expect(result.stdout).toContain(`reports/runs/verify/${FAIL_RUN}/stages/browser-e2e-smoke.log`);
  expect(result.stdout).not.toContain("lint-biome: no findings");
});

test("--stages preserves a runtime no-verdict and renders other failed stages too", async ({ runCli, plantedTree }) => {
  const runtime = JSON.parse(failingVerifyReport(FAIL_RUN)) as VerifyReport;
  const stages = runtime.stages
    .filter((stage) => stage.group === "browser")
    .map((stage) => (stage.name === "browser:ct" ? { ...stage, exitCode: EXIT.toolError, childExit: null } : stage));
  const files = Object.fromEntries(Object.entries(failingSlot(FAIL_RUN)).filter(([path]) => path !== "reports/check-structure.json"));
  files[`reports/runs/verify/${FAIL_RUN}/verify.json`] = JSON.stringify({
    ...runtime,
    tier: "full",
    scope: "application",
    stages,
    failed: stages.length,
    exitCode: EXIT.toolError,
    noVerdict: ["browser:ct"],
  });
  const root = await plantedTree(files);
  publishVerify(root, FAIL_RUN);
  const result = await runCli("verify", ["show", "--stages", "--limit", "20"], { cwd: root });
  await expect(result).toExitWith(EXIT.toolError);
  expect(result.stdout).toContain("NO VERDICT from: browser:ct");
  expect(result.stdout).toContain("bar breaks");
  expect(result.stdout).toContain("Timed out waiting 180000ms");
});

test("--stages exposes a missing failed-stage log as broken evidence while retaining the other transcript", async ({ runCli, plantedTree }) => {
  const files = Object.fromEntries(Object.entries(failingSlot(FAIL_RUN)).filter(([path]) => path !== "reports/check-structure.json"));
  const root = await plantedTree(files);
  publishVerify(root, FAIL_RUN);
  rmSync(join(root, `reports/runs/verify/${FAIL_RUN}/stages/tests-node.log`));
  const result = await runCli("verify", ["show", "--stages", "--limit", "20"], { cwd: root });
  await expect(result).toExitWith(EXIT.toolError);
  expect(result.stdout).toContain("not readable");
  expect(result.stdout).toContain("Timed out waiting 180000ms");
});

test("--stages applies the tail limit independently to every failed transcript", async ({ runCli, plantedTree }) => {
  const files = { ...failingSlot(FAIL_RUN) };
  files[`reports/runs/verify/${FAIL_RUN}/stages/tests-node.log`] = "node earlier\nnode last\n";
  files[`reports/runs/verify/${FAIL_RUN}/stages/browser-ct.log`] = "ct earlier\nct last\n";
  const root = await plantedTree(files);
  publishVerify(root, FAIL_RUN);
  const result = await runCli("verify", ["show", "--stages", "--limit", "2"], { cwd: root });
  await expect(result).toExitWith(EXIT.violations);
  expect(result.stdout).toContain("node last");
  expect(result.stdout).toContain("ct last");
  expect(result.stdout).not.toContain("node earlier");
  expect(result.stdout).not.toContain("ct earlier");
  expect(result.stdout).toContain("earlier line(s) omitted (--limit N to widen; whole log:");
});
