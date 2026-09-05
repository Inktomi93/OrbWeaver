// Scenario-owned typed fact batches and aggregate run-arm pairs.

import { aggregateScope, factBatchId } from "../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../_shared/artifacts.ts";
import type { BrowserPageError, ProbeSession } from "../../_shared/browser-contract.ts";
import type { BrowserEvidenceRetentionBatch } from "../../_shared/browser-evidence-ring.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SnapArmFactFor } from "../contract/run-facts.ts";
import { snapArmFact, snapExitCode, snapExitState } from "../contract/run-facts.ts";
import type { ScenarioSpec } from "../contract/scenario.ts";
import type { Args, CaptureOutcome, ShotPlan } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import type { SnapRatePosture } from "../lib/rate-posture.ts";
import type { RunArms } from "./arms/registry.ts";
import { pageArmFacts, writePageArmEvidence } from "./arms/registry.ts";
import { registerSnapFactBatch } from "./run-bundle.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --scenario <file.json>");

function scenarioFilmstripFacts(runArms: readonly RunArms[]): readonly SnapArmFactFor<"filmstrip">[] {
  return runArms.flatMap((arms) => arms.facts({}).filter((fact): fact is SnapArmFactFor<"filmstrip"> => fact.arm === "filmstrip"));
}

export function scenarioFilmstripFrameCount(runArms: readonly RunArms[]): number {
  return scenarioFilmstripFacts(runArms).reduce((total, fact) => total + fact.data.retainedFrames, 0);
}

export function scenarioFilmstripPairs(runArms: readonly RunArms[], checkpoints: readonly Args[]): readonly ResultPair[] {
  if (!checkpoints.some((checkpoint) => checkpoint.filmstrip)) {
    return [];
  }
  const facts = scenarioFilmstripFacts(runArms);
  const paths = facts.map((fact) => fact.data.artifact).filter((value): value is NonNullable<typeof value> => value !== null);
  return [
    ["filmstrip", facts.some((fact) => fact.data.state === "refused") ? "REFUSED" : paths.join(",")],
    ["filmstrip-frames", facts.reduce((total, fact) => total + fact.data.retainedFrames, 0)],
    ["filmstrip-omitted", facts.reduce((total, fact) => total + fact.data.omittedFrames, 0)],
    ["filmstrip-actions", facts.reduce((total, fact) => total + fact.data.actions, 0)],
  ];
}

export interface ScenarioFactInput {
  readonly opts: Args;
  readonly spec: ScenarioSpec;
  readonly checkpoints: readonly Args[];
  readonly session: ProbeSession;
  readonly ratePosture: SnapRatePosture;
  readonly outcomes: readonly CaptureOutcome[];
  readonly plans: readonly ShotPlan[];
  readonly reportPlan: ShotPlan;
  readonly failedRequests: readonly import("../../_shared/browser-capture.ts").CapturedRequest[];
  readonly pageErrors: readonly BrowserPageError[];
  readonly failures: SnapFailureSummary;
  readonly retention: BrowserEvidenceRetentionBatch;
  readonly finalCode: number;
  readonly runArms: readonly RunArms[];
}

/** ASYNC since #1342: the per-checkpoint page-arm evidence is written here, where the checkpoint's name is
 *  in hand, and it must land before the run slot is published. */
export async function registerScenarioFacts(input: ScenarioFactInput): Promise<void> {
  const { opts, spec, checkpoints, session, ratePosture, outcomes, plans, reportPlan, failedRequests, pageErrors, failures, retention, finalCode, runArms } =
    input;
  const scope = aggregateScope();
  const scenarioKey = opts.out ?? spec.name;
  const cascadeReceipts = outcomes.flatMap((outcome) => outcome.cssEvidence?.cascade ?? []);
  const cascadeFailures = cascadeReceipts.filter((receipt) => receipt.status === "instrument-error").length;
  registerSnapFactBatch({
    id: factBatchId(`${scenarioKey}:scenario`),
    core: [
      {
        kind: "core",
        schema: "snap-rate-posture-v1",
        source: "browser-system-info+host-load",
        lifetime: "one Snap run/cell",
        scope,
        artifacts: [],
        data: ratePosture,
      },
      {
        kind: "core",
        schema: "snap-browser-retention-v1",
        source: "bounded-browser-evidence-rings",
        lifetime: "one Snap run/cell",
        scope,
        artifacts: [],
        data: retention,
      },
      {
        kind: "core",
        schema: "snap-core-run-v1",
        source: "snap-run-owner",
        lifetime: "one Snap run/cell",
        scope,
        artifacts: [],
        data: {
          exit: snapExitCode(finalCode),
          state: snapExitState(finalCode),
          pages: 1,
          contexts: session.contexts.length,
          captures: outcomes.length,
          fileActions: outcomes.reduce((count, outcome) => count + outcome.fileActions.length, 0),
          failedRequests: failedRequests.length,
          pageErrors: pageErrors.length,
          diagnostics: session.diagnostics.length,
          failures,
        },
      },
    ],
    arms:
      opts.cascade.length === 0
        ? []
        : [
            snapArmFact({
              arm: "cascade",
              schema: "snap-arm-cascade-v1",
              source: "CDP CSS + CSSOverview",
              lifetime: "settled page capture",
              scope,
              artifacts: [],
              data: { state: cascadeFailures > 0 ? "refused" : "passed", detail: null, queries: cascadeReceipts.length, failures: cascadeFailures },
            }),
          ],
  });
  for (const [index, outcome] of outcomes.entries()) {
    const checkpoint = spec.checkpoints[index]?.name ?? String(index);
    const plan = plans[index] ?? reportPlan;
    const checkpointOpts = checkpoints[index] ?? opts;
    const checkpointInput = { opts: checkpointOpts, outcomes: [outcome], ctx: { ...plan, failed: [...failedRequests], totalPages: 1 } };
    // #1342: one evidence file per CHECKPOINT, prefixed by its name — a scenario runs the same arms many
    // times and a shared basename would leave only the last checkpoint's values on disk.
    await writePageArmEvidence(checkpointInput, `${checkpoint}-`);
    registerSnapFactBatch({
      id: factBatchId(`${scenarioKey}:checkpoint:${checkpoint}`),
      core: [],
      arms: [...pageArmFacts(checkpointInput, {}), ...(runArms[index]?.facts({}) ?? [])],
    });
  }
}
