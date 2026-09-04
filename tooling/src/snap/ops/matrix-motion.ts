// Motion matrix execution stays on Snap's ordinary run/session path. The matrix owns only appearance
// planning, selector substitution, STATIC-EXPECTED reconciliation, and its aggregate receipt.
import { writeFile } from "node:fs/promises";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { aggregateScope } from "../../_shared/artifact-scope.ts";
import { print } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdictReceipt } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { loadResultPairs } from "../../_shared/load-budget.ts";
import type { MotionMatrixCellEvidence } from "../../motion-audit/index.ts";
import { evaluateMotionStaticExpected, motionMatrixVariant, planMotionAppearanceMatrix } from "../../motion-audit/index.ts";
import type { SnapAppearanceContract } from "../contract/matrix.ts";
import type { SnapDetailedResult } from "../contract/run.ts";
import type { Args, SnapAction } from "../contract/types.ts";
import { shouldProduceShot, variantOut } from "../lib/out-names.ts";
import { snapDestination } from "./guards.ts";
import { runOnSession, runSnapDetailed } from "./run.ts";
import { registerSnapResultPairs } from "./run-bundle.ts";
import { finishSnapContext, openSnapMatrixContext } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix --motion <selector>");

export interface MotionMatrixDiscovery {
  readonly contract: SnapAppearanceContract;
  readonly reachedRows: number;
  readonly reachedSubjects: number;
}

function motionSelector(opts: Args): string | null {
  const action = opts.actions.find((entry) => entry.type === "step" && entry.action.kind === "motion-click");
  return action?.type === "step" && action.action.kind === "motion-click" ? action.action.selector : null;
}

function motionActions(actions: readonly SnapAction[], selector: string | null): SnapAction[] {
  return actions.map((entry) =>
    entry.type === "step" && entry.action.kind === "motion-click" ? { type: "step" as const, action: { ...entry.action, selector } } : entry,
  );
}

async function runMotionMatrixCell(host: ProbeSession | null, runArgs: Args, id: string): Promise<SnapDetailedResult> {
  if (host === null) {
    return await runSnapDetailed(runArgs);
  }
  const opened = await openSnapMatrixContext(host, runArgs);
  const destination = snapDestination(runArgs);
  try {
    return await runOnSession(
      opened.session,
      runArgs,
      {
        url: destination.url,
        name: destination.name,
        out: await artifactFile("snaps", destination.name, ".png"),
        key: id,
        produceShot: shouldProduceShot(runArgs),
        navigate: true,
      },
      {
        window: null,
        finish: async (red) => await finishSnapContext(opened.context, red, id, runArgs.failureEvidence),
      },
    );
  } catch (error) {
    await opened.context.context.close();
    throw error;
  }
}

function motionMatrixVerdict(toolErrors: number, violations: number): number {
  if (toolErrors > 0) {
    return EXIT.toolError;
  }
  return violations > 0 ? EXIT.violations : EXIT.clean;
}

export async function runMotionMatrix(opts: Args, baseName: string, discovery: MotionMatrixDiscovery, host: ProbeSession | null): Promise<number> {
  const selector = motionSelector(opts);
  const matrix = planMotionAppearanceMatrix(discovery.contract, selector);
  print(`MOTION MATRIX PLAN  cells=${String(matrix.plan.cells.length)} pairs-uncovered=${String(matrix.plan.receipt.uncoveredPairs.length)}`);
  const cells: MotionMatrixCellEvidence[] = [];
  for (const [index, cell] of matrix.plan.cells.entries()) {
    const variant = motionMatrixVariant(matrix, cell, index);
    const runArgs: Args = {
      ...opts,
      matrix: false,
      out: variantOut(baseName, variant.id),
      actions: motionActions(opts.actions, variant.selector),
      appearance: { reducedMotion: variant.appReducedMotion },
      reducedMotion: variant.osReducedMotion,
      device: variant.device,
      colorScheme: null,
    };
    print(`\n========== MOTION MATRIX ${variant.id} ==========`);
    const result = await runMotionMatrixCell(host, runArgs, variant.id);
    cells.push({
      id: variant.id,
      code: result.code,
      variant,
      data: result.receipt?.motion ?? null,
      route: snapDestination(runArgs).url,
      windowMs: runArgs.motionWindowMs,
      throttle: runArgs.motionThrottle,
    });
  }
  const staticExpected = evaluateMotionStaticExpected(matrix.staticExpected, cells);
  print(
    `MOTION MATRIX STATIC  candidate=${staticExpected.candidateId} control=${staticExpected.controlId} status=${staticExpected.status} detail=${staticExpected.detail}`,
  );
  const effectiveCodes = cells.map((cell) => (cell.id === staticExpected.candidateId ? staticExpected.candidateCode : cell.code));
  const toolErrors = effectiveCodes.filter((code) => code === EXIT.toolError).length;
  const violations = effectiveCodes.filter((code) => code === EXIT.violations).length;
  const path = await artifactFile("motion", `${baseName}-motion-matrix`, ".json", {
    producer: "motion",
    producerArm: "motion",
    channel: "motion-matrix",
    mediaType: "application/json",
    schema: "snap-motion-matrix-v1",
    role: "primary",
    completeness: "complete",
    completenessDetail: "complete declared motion matrix plan, cell receipts, and STATIC-EXPECTED reconciliation",
    scope: aggregateScope(),
    records: cells.length,
    limits: [],
  });
  await writeFile(
    path,
    `${JSON.stringify({ schemaVersion: 1, discovery: { reachedRows: discovery.reachedRows, reachedSubjects: discovery.reachedSubjects }, plan: matrix.plan.receipt, staticExpected, cells }, null, 2)}\n`,
    "utf8",
  );
  const terminal = printVerdictReceipt("snap-matrix", {
    verdict: motionMatrixVerdict(toolErrors, violations),
    denominators: {
      variants: { value: matrix.plan.cells.length, refuseWhen: "zero" },
      "reached-subjects": { value: discovery.reachedSubjects, refuseWhen: "zero" },
    },
    pairs: [
      ["mode", "motion"],
      ["instrument-errors", toolErrors],
      ["violations", violations],
      ["uncovered-pairs", matrix.plan.receipt.uncoveredPairs.length],
      ["required-twins", matrix.plan.receipt.requiredTwins.length],
      ["static-expected", staticExpected.status === "static-expected" ? 1 : 0],
      ["static-candidate", staticExpected.candidateId],
      ["static-control", staticExpected.controlId],
      ["json", path],
      ...loadResultPairs(),
    ],
  });
  registerSnapResultPairs(terminal.pairs);
  return terminal.exit;
}
