import { globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { z } from "zod";
import { APPLICATION_PARTITIONS } from "../contract/application-partitions.ts";
import type { ApplicationPartitionInput, StageResult, Tier, VerifyReport } from "../contract/stage.ts";
import { STAGE_MODES } from "../contract/stage.ts";
import { applicationPartitionKeys, applicationPartitionStages } from "./application-partitions.ts";
import { aggregateExit, noVerdictStages } from "./exit-classifiers.ts";
import { stagesForTier } from "./registry.ts";
import { planStage } from "./stage-plan.ts";

const RESULT = z
  .object({
    name: z.string(),
    group: z.string(),
    mode: z.enum(STAGE_MODES),
    ok: z.boolean(),
    exitCode: z.number().int().min(EXIT.clean).max(EXIT.misuse),
    childExit: z.number().int().nullable().optional(),
    durationMs: z.number().nonnegative(),
    logFile: z.string().nullable(),
    failureExcerpt: z.string().nullable(),
    runsAt: z.string().nullable(),
    notices: z.array(z.string()),
  })
  .transform(({ childExit, ...stage }): StageResult => (childExit === undefined ? stage : { ...stage, childExit }));
const RECEIPT = z.object({
  tier: z.string(),
  scope: z.literal("application"),
  partition: z.object({ name: z.enum(APPLICATION_PARTITIONS), shard: z.string().nullable(), head: z.string().regex(/^[a-f0-9]{40}$/u) }),
  run: z.object({
    // @orb-waive no-raw-id(runId): openRunSlot owns checkout/pid/ISO artifact names, not domain TypeIDs; ends if RunSlot adopts TypeIDs.
    runId: z.string().min(1),
    checkout: z.string().min(1),
    artifactDir: z.string().min(1),
    concurrent: z.array(z.string()),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
  }),
  ok: z.boolean(),
  exitCode: z.number().int().min(EXIT.clean).max(EXIT.misuse),
  failed: z.number().int().nonnegative(),
  noVerdict: z.array(z.string()),
  stages: z.array(RESULT),
});

/** Read complete native partition reports and fold them into the ordinary registry stage denominator. */
export function aggregateApplicationPartitions(tier: Tier, head: string, inputs: readonly ApplicationPartitionInput[], output: string): readonly StageResult[] {
  const expected = applicationPartitionKeys(tier);
  const seen = new Set<string>();
  const rows = new Map<string, { readonly stage: StageResult; readonly root: string; readonly key: string }[]>();
  for (const input of inputs) {
    const report = RECEIPT.parse(input.report);
    const key = `${report.partition.name}${report.partition.shard === null ? "" : `:${report.partition.shard}`}`;
    if (!expected.includes(key) || seen.has(key) || report.partition.head !== head || report.tier !== tier || report.run.finishedAt < report.run.startedAt) {
      throw new Error(`qualification refuses foreign, duplicate or unfinished partition ${key}`);
    }
    if (report.run.artifactDir !== `reports/runs/verify/${report.run.runId}`) {
      throw new Error(`qualification refuses a foreign native run slot in ${key}`);
    }
    seen.add(key);
    const names = applicationPartitionStages(tier, report.partition.name).map((stage) => stage.name);
    if (JSON.stringify(report.stages.map((stage) => stage.name)) !== JSON.stringify(names)) {
      throw new Error(`qualification refuses an incomplete stage denominator in ${key}`);
    }
    requireNativeSummary(report, key);
    for (const stage of report.stages) {
      const existing = rows.get(stage.name) ?? [];
      existing.push({ stage, root: input.root, key });
      rows.set(stage.name, existing);
    }
  }
  const missing = expected.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    throw new Error(`qualification has no verdict from partitions: ${missing.join(", ")}`);
  }
  mkdirSync(join(output, "stages"), { recursive: true });
  return stagesForTier(tier).map((definition) => {
    const parts = rows.get(definition.name);
    if (parts === undefined || parts.length === 0) {
      throw new Error(`qualification has no verdict from ${definition.name}`);
    }
    const plan = planStage(definition, undefined, tier, { applicationOnly: true });
    if (plan.mode === "skipped") {
      if (
        parts.length !== 1 ||
        parts[0]?.stage.mode !== "skipped" ||
        parts[0].stage.childExit !== undefined ||
        parts[0].stage.logFile !== null ||
        !parts[0].stage.ok ||
        parts[0].stage.exitCode !== 0
      ) {
        throw new Error(`qualification refuses a false implementation-only exclusion for ${definition.name}`);
      }
      return parts[0].stage;
    }
    const invalid = parts.some(
      ({ stage }) =>
        stage.mode !== "full" || stage.childExit === undefined || stage.childExit === null || stage.logFile === null || stage.ok !== (stage.exitCode === 0),
    );
    const exitCode = invalid ? 2 : aggregateExit(parts.map(({ stage }) => stage.exitCode));
    const logFile = join(output, "stages", `${definition.name.replaceAll(":", "-")}.log`);
    writeFileSync(
      logFile,
      parts
        .map(
          ({ stage, root, key }) =>
            `=== ${key} ===\n${stage.logFile === null ? "NO TRANSCRIPT" : readFileSync(join(root, stage.logFile.replace(/^reports\//u, "")), "utf8")}`,
        )
        .join("\n"),
    );
    return {
      name: definition.name,
      group: definition.group,
      mode: "full",
      ok: exitCode === 0,
      exitCode,
      ...foldedChildExit(
        parts.map(({ stage }) => stage),
        invalid,
      ),
      partitionResults: parts.map(({ key, stage, root }) => ({
        key,
        result: { ...stage, logFile: stage.logFile === null ? null : join(root, stage.logFile.replace(/^reports\//u, "")) },
      })),
      durationMs: parts.reduce((total, { stage }) => total + stage.durationMs, 0),
      logFile,
      failureExcerpt: invalid ? "partition did not execute its complete native stage" : failureExcerpts(parts.map(({ stage }) => stage)),
      runsAt: null,
      notices: parts.flatMap(({ stage, key }) => [`partition ${key}`, ...stage.notices]),
    };
  });
}

/** GitHub downloads each named artifact into its own directory; only its completed top-level pointer is a receipt. */
export function readApplicationPartitionInputs(directory: string): readonly ApplicationPartitionInput[] {
  return [...globSync("*/verify.json", { cwd: directory })].map((path) => {
    const reportPath = join(directory, path);
    return { report: JSON.parse(readFileSync(reportPath, "utf8")) as VerifyReport, root: dirname(reportPath) };
  });
}

function failureExcerpts(stages: readonly StageResult[]): string | null {
  return (
    stages
      .map((stage) => stage.failureExcerpt)
      .filter(Boolean)
      .join("\n") || null
  );
}

function foldedChildExit(stages: readonly StageResult[], invalid: boolean): Pick<StageResult, "childExit"> {
  if (invalid) {
    return { childExit: null };
  }
  if (stages.length !== 1) {
    return {};
  }
  return { childExit: stages[0]?.childExit ?? null };
}

function requireNativeSummary(report: Pick<VerifyReport, "exitCode" | "ok" | "failed" | "noVerdict" | "stages">, key: string): void {
  if (
    report.exitCode !== aggregateExit(report.stages.map((stage) => stage.exitCode)) ||
    report.ok !== (report.exitCode === 0) ||
    report.failed !== report.stages.filter((stage) => !stage.ok).length ||
    JSON.stringify(report.noVerdict) !== JSON.stringify(noVerdictStages(report.stages))
  ) {
    throw new Error(`qualification refuses contradictory native summary in ${key}`);
  }
}
