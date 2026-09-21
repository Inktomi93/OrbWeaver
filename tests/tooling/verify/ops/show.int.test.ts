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
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { vi } from "vitest";
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
