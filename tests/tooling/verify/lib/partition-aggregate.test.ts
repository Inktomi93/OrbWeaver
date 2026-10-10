import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { testProcessEnv, withProcessEnv } from "@orb/tooling/_shared/process-env";
import type { ApplicationPartition } from "../../../../tooling/src/verify/contract/application-partitions.ts";
import { APPLICATION_PARTITIONS } from "../../../../tooling/src/verify/contract/application-partitions.ts";
import type { StageResult, VerifyReport } from "../../../../tooling/src/verify/contract/stage.ts";
import { applicationPartitionKeys, applicationPartitionStages } from "../../../../tooling/src/verify/lib/application-partitions.ts";
import { aggregateExit, noVerdictStages } from "../../../../tooling/src/verify/lib/exit-classifiers.ts";
import { aggregateApplicationPartitions } from "../../../../tooling/src/verify/lib/partition-aggregate.ts";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
import { nonRunningStageResult, planStage } from "../../../../tooling/src/verify/lib/stage-plan.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const HEAD = "a".repeat(40);
test("hosted mutation omission remains an exact unmeasured row in the native denominator", async ({ scratch }) => {
  await withProcessEnv("GITHUB_ACTIONS", "true", () =>
    withProcessEnv("RUNNER_ENVIRONMENT", "github-hosted", async () => {
      const input = receipts(scratch);
      const stages = aggregateApplicationPartitions("full", HEAD, input, join(scratch, "hosted"));
      expect(stages.map(({ name }) => name)).toEqual(stagesForTier("full").map(({ name }) => name));
      const mutation = stages.find(({ name }) => name === "quality:mutation-gate");
      expect(mutation).toMatchObject({ mode: "skipped", durationMs: 0, logFile: null });
      expect(mutation?.notices.join(" ")).toContain("not measured on GitHub-hosted CI");
      expect(mutation).not.toHaveProperty("childExit");
      expect(noVerdictStages(stages)).toEqual([]);
      const quality = input.find(({ report }) => report.partition?.name === "quality");
      if (quality === undefined) {
        throw new Error("missing quality partition");
      }
      const original = quality.report;
      quality.report = { ...original, stages: original.stages.map((row) => Object.fromEntries(Object.entries(row).reverse()) as StageResult) };
      expect(aggregateApplicationPartitions("full", HEAD, input, join(scratch, "reordered")).find(({ name }) => name === "quality:mutation-gate")).toEqual(
        mutation,
      );
      for (const patch of [{ notices: [] }, { durationMs: 1 }, { runsAt: "verify --weekly" }, { childExit: 0 }, { mode: "full" as const }]) {
        quality.report = { ...original, stages: original.stages.map((row) => (row.name === "quality:mutation-gate" ? { ...row, ...patch } : row)) };
        expect(() => aggregateApplicationPartitions("full", HEAD, input, join(scratch, "corrupt"))).toThrow(/exclusion/u);
      }
      quality.report = {
        ...original,
        stages: original.stages.map((row) => (row.name === "quality:mutation-gate" ? { ...row, extra: "invented authority" } : row)),
      };
      expect(() => aggregateApplicationPartitions("full", HEAD, input, join(scratch, "extra"))).toThrow();
      quality.report = { ...original, stages: original.stages.filter(({ name }) => name !== "quality:mutation-gate") };
      expect(() => aggregateApplicationPartitions("full", HEAD, input, join(scratch, "missing"))).toThrow(/denominator/u);
      quality.report = original;
      await withProcessEnv("RUNNER_ENVIRONMENT", "self-hosted", () => {
        const local = aggregateApplicationPartitions("full", HEAD, input, join(scratch, "local"));
        expect(noVerdictStages(local)).toContain("quality:mutation-gate");
        expect(aggregateExit(local.map(({ exitCode }) => exitCode))).toBe(2);
        return Promise.resolve();
      });
    }),
  );
});
function receipts(root: string): { report: VerifyReport; root: string }[] {
  return applicationPartitionKeys("full").map((key) => {
    const [name, shard] = key.split(":");
    const partition = name as ApplicationPartition;
    expect(APPLICATION_PARTITIONS).toContain(partition);
    const stages: StageResult[] = applicationPartitionStages("full", partition).map((stage) => {
      const plan = planStage(stage, undefined, "full", { applicationOnly: true });
      if (plan.mode === "skipped") {
        return nonRunningStageResult(stage, plan);
      }
      const logFile = `reports/runs/verify/fixture/stages/${stage.name.replaceAll(":", "-")}.log`;
      mkdirSync(join(root, "runs/verify/fixture/stages"), { recursive: true });
      writeFileSync(join(root, logFile.replace("reports/", "")), "native stage transcript\n");
      return {
        name: stage.name,
        group: stage.group,
        mode: "full",
        ok: true,
        exitCode: 0,
        childExit: 0,
        durationMs: 1,
        logFile,
        failureExcerpt: null,
        runsAt: null,
        notices: [],
      };
    });
    return {
      root,
      report: {
        tier: "full",
        scope: "application",
        partition: { name: partition, shard: shard ?? null, head: HEAD },
        run: {
          runId: "fixture",
          checkout: "fixture",
          artifactDir: "reports/runs/verify/fixture",
          startedAt: "2026-10-09T00:00:00.000Z",
          finishedAt: "2026-10-09T00:01:00.000Z",
          concurrent: [],
        },
        ok: true,
        exitCode: 0,
        failed: 0,
        noVerdict: [],
        stages,
      },
    };
  });
}
function replaceNode(input: { report: VerifyReport; root: string }[], patch: Partial<StageResult>): void {
  const node = input.find((row) => row.report.partition?.name === "node");
  if (node === undefined) {
    throw new Error("missing fixture node partition");
  }
  const stages = node.report.stages.map((stage) => ({ ...stage, ...patch }));
  const exitCode = aggregateExit(stages.map((stage) => stage.exitCode));
  node.report = {
    ...node.report,
    stages,
    exitCode,
    ok: exitCode === 0,
    failed: stages.filter((stage) => !stage.ok).length,
    noVerdict: noVerdictStages(stages),
  };
}
test("complete native shards fold once in registry order and checker-only subjects remain native exclusions", ({ scratch }) => {
  const stages = aggregateApplicationPartitions("full", HEAD, receipts(scratch), join(scratch, "aggregate"));
  expect(stages.map((stage) => stage.name)).toEqual(stagesForTier("full").map((stage) => stage.name));
  expect(stages.filter((stage) => stage.mode === "full").every((stage) => stage.ok)).toBe(true);
  expect(stages.some((stage) => stage.name === "tests:tooling")).toBe(false);
  expect(stages.find((stage) => stage.name === "tests:node")?.notices).toHaveLength(3);
  expect(stages.find((stage) => stage.name === "tests:node")?.partitionResults?.map((row) => row.result.childExit)).toEqual([0, 0, 0]);
});
for (const corruption of ["missing", "duplicate", "foreign", "short", "contradictory", "manifest"] as const) {
  test(`qualification refuses ${corruption} native partition evidence`, ({ scratch }) => {
    const input = receipts(scratch);
    const row = input[0];
    if (row === undefined || row.report.partition === undefined) {
      throw new Error("missing fixture");
    }
    if (corruption === "missing") {
      input.pop();
    }
    if (corruption === "duplicate") {
      input.push(row);
    }
    if (corruption === "foreign") {
      row.report = { ...row.report, partition: { ...row.report.partition, head: "b".repeat(40) } };
    }
    if (corruption === "short") {
      row.report = { ...row.report, stages: [] };
    }
    if (corruption === "manifest") {
      row.report = {
        ...row.report,
        run: {
          runId: "foreign",
          checkout: "fixture",
          artifactDir: "outside-native-run-slot",
          startedAt: "2026-10-09T00:00:00.000Z",
          finishedAt: "2026-10-09T00:01:00.000Z",
          concurrent: [],
        },
      };
    }
    if (corruption === "contradictory") {
      row.report = { ...row.report, failed: 1 };
    }
    expect(() => aggregateApplicationPartitions("full", HEAD, input, join(scratch, "aggregate"))).toThrow(/refus|no verdict/u);
  });
}
for (const mode of ["skipped", "deferred"] as const) {
  test(`a green ${mode} runtime stage cannot qualify`, ({ scratch }) => {
    const input = receipts(scratch);
    replaceNode(input, { mode, logFile: null });
    const stages = aggregateApplicationPartitions("full", HEAD, input, join(scratch, "aggregate"));
    expect(stages.find((stage) => stage.name === "tests:node")).toMatchObject({ ok: false, exitCode: 2, childExit: null });
    expect(noVerdictStages(stages)).toContain("tests:node");
  });
}
test("failed and killed native children preserve violation and no-verdict authority", ({ scratch }) => {
  for (const [exitCode, childExit] of [
    [1, 1],
    [2, null],
  ] as const) {
    const input = receipts(scratch);
    replaceNode(input, { ok: false, exitCode, childExit });
    const stages = aggregateApplicationPartitions("full", HEAD, input, join(scratch, "aggregate"));
    expect(aggregateExit(stages.map((stage) => stage.exitCode))).toBe(exitCode);
    expect(noVerdictStages(stages).includes("tests:node")).toBe(exitCode === 2);
  }
});

test("native full aggregation publishes the ordinary report and the existing audit reader consumes it", ({ scratch, repoRoot }) => {
  const tree = join(scratch, "checkout");
  mkdirSync(tree);
  execFixtureGit(tree, ["init", "--initial-branch=main"]);
  execFixtureGit(tree, ["config", "user.name", "Qualification proof"]);
  execFixtureGit(tree, ["config", "user.email", "proof@example.invalid"]);
  execFixtureGit(tree, ["commit", "--allow-empty", "-m", "fixture source"]);
  const head = execFixtureGit(tree, ["rev-parse", "HEAD"]).trim();
  const directory = join(tree, "reports/inputs");
  for (const [index, input] of receipts(join(scratch, "fixture-logs")).entries()) {
    const child = join(directory, `child-${index}`);
    mkdirSync(child, { recursive: true });
    const partition = input.report.partition;
    if (partition === undefined) {
      throw new Error("missing fixture partition");
    }
    const stages = input.report.stages.map((stage) => {
      if (stage.logFile === null) {
        return stage;
      }
      const path = join(child, stage.logFile.replace("reports/", ""));
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "retained native child transcript\n");
      return stage;
    });
    writeFileSync(join(child, "verify.json"), JSON.stringify({ ...input.report, partition: { ...partition, head }, stages }));
  }
  const invoke = (argv: readonly string[]): SpawnSyncReturns<string> =>
    spawnSync(process.execPath, [join(repoRoot, "tooling/src/verify/cli.ts"), ...argv], { cwd: tree, encoding: "utf8", env: testProcessEnv() });
  const aggregate = invoke(["run", "--full", `--aggregate=${directory}`]);
  expect(aggregate.status, aggregate.stdout + aggregate.stderr).toBe(0);
  const report = JSON.parse(readFileSync(join(tree, "reports/verify.json"), "utf8")) as VerifyReport;
  expect(report).toMatchObject({ tier: "full", scope: "application", ok: true, noVerdict: [], failed: 0 });
  expect(report.stages.map((stage) => stage.name)).toEqual(stagesForTier("full").map((stage) => stage.name));
  const reader = invoke(["show", "--stage", "tests:node"]);
  expect(reader.status, reader.stdout + reader.stderr).toBe(0);
  expect(reader.stdout).toContain("retained native child transcript");
  expect(reader.stdout).toContain("node:1/3");
  expect(reader.stdout).toContain("node:3/3");
});

test("a classifier cannot launder a killed native child into successful full qualification", ({ scratch }) => {
  const input = receipts(scratch);
  replaceNode(input, { ok: true, exitCode: 0, childExit: null });
  const stages = aggregateApplicationPartitions("full", HEAD, input, join(scratch, "aggregate"));
  expect(aggregateExit(stages.map((stage) => stage.exitCode))).toBe(2);
  expect(noVerdictStages(stages)).toContain("tests:node");
});
