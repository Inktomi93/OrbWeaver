// --matrix: discover the live application reduced-motion carrier, plan six representative cells, and
// feed each through motion-audit's ordinary trace/budget path. Planning is shared; motion semantics stay
// in the existing single-run implementation.

import { writeFile } from "node:fs/promises";
import { errorMessage } from "@orb/kit/error-message";
import { appearanceReachReceipt, readRuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { print, routeSlug } from "../../_shared/artifacts.ts";
import { buildUrl, launchProbeSession, settle, withProbeSession } from "../../_shared/browser.ts";
import { readBrowserEnvironment } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { Args } from "../contract/types.ts";
import { MOUNT_SETTLE_MS, NAV_TIMEOUT_MS, READY_TIMEOUT_MS } from "../lib/budgets.ts";
import { hasOrbBridge } from "./drive.ts";
import type { MotionAppearanceMatrix } from "./matrix-contract.ts";
import { motionMatrixVariant, planMotionAppearanceMatrix } from "./matrix-contract.ts";
import type { MotionMatrixCellEvidence, MotionStaticExpectedVerdict } from "./matrix-verdict.ts";
import { evaluateMotionStaticExpected } from "./matrix-verdict.ts";
import { runMotionAuditDetailed } from "./run.ts";

refuseDirectInvocation(import.meta.url, "pnpm motion-audit --matrix --selector <selector>");

interface MatrixDiscovery {
  readonly contract: Awaited<ReturnType<typeof readRuntimeAppearanceContract>>;
  readonly reachedRows: number;
  readonly reachedSubjects: number;
}

type MatrixCellResult = MotionMatrixCellEvidence;

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

function aggregateVerdict(toolErrors: number, violations: number): number {
  if (toolErrors > 0) {
    return EXIT.toolError;
  }
  return violations > 0 ? EXIT.violations : EXIT.clean;
}

async function discoverMatrix(opts: Args): Promise<MatrixDiscovery> {
  const url = opts.url ?? buildUrl(opts.base, opts.route);
  const session = await launchProbeSession({
    headless: !opts.vnc,
    viewport: opts.viewport,
    device: null,
    colorScheme: null,
    reducedMotion: false,
    appearance: { reducedMotion: false },
    theme: opts.theme,
    localStorage: [],
  });
  return await withProbeSession(session, async () => {
    await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // @orb-gate-ignore caught-failure-ownership(promise:waitFor): false is consumed immediately below as an INSTRUMENT ERROR; discovery never proceeds against a cold shell. Ends if `ready` stops gating the return.
    const ready = await session.page
      .locator("html[data-app-ready]")
      .waitFor({ state: "attached", timeout: READY_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    await settle(session.page, MOUNT_SETTLE_MS);
    if (!(ready && (await hasOrbBridge(session.page)))) {
      return instrumentError(`motion matrix discovery did not reach a ready app bridge (ready=${String(ready)})`);
    }
    const environment = await readBrowserEnvironment(session.page, session.environmentContract);
    if (environment.mismatches.length > 0) {
      return instrumentError(`motion matrix discovery browser mismatch: ${environment.mismatches.join("; ")}`);
    }
    const contract = await readRuntimeAppearanceContract(session.page);
    const reached = appearanceReachReceipt(contract);
    return { contract, reachedRows: reached.rows, reachedSubjects: reached.subjects };
  });
}

function cellArgs(
  opts: Args,
  matrix: MotionAppearanceMatrix,
  index: number,
): { readonly args: Args; readonly id: string; readonly variant: ReturnType<typeof motionMatrixVariant> } {
  const cell = matrix.plan.cells[index];
  if (cell === undefined) {
    return instrumentError(`motion matrix is missing cell ${String(index)}`);
  }
  const variant = motionMatrixVariant(matrix, cell, index);
  return {
    id: variant.id,
    variant,
    args: {
      ...opts,
      matrix: false,
      selector: variant.selector,
      appearance: { reducedMotion: variant.appReducedMotion },
      osReducedMotion: variant.osReducedMotion,
      device: variant.device,
    },
  };
}

async function runCells(opts: Args, matrix: MotionAppearanceMatrix): Promise<readonly MatrixCellResult[]> {
  const results: MatrixCellResult[] = [];
  for (let index = 0; index < matrix.plan.cells.length; index += 1) {
    const cell = cellArgs(opts, matrix, index);
    print(`\n========== MOTION MATRIX ${cell.id} ==========`);
    const result = await runMotionAuditDetailed(cell.args);
    results.push({
      id: cell.id,
      code: result.code,
      variant: cell.variant,
      data: result.data,
      route: cell.args.url ?? cell.args.route,
      windowMs: cell.args.windowMs,
      throttle: cell.args.throttle,
    });
  }
  return results;
}

interface MatrixReceiptInput {
  readonly opts: Args;
  readonly discovery: MatrixDiscovery;
  readonly matrix: MotionAppearanceMatrix;
  readonly cells: readonly MatrixCellResult[];
  readonly staticExpected: MotionStaticExpectedVerdict;
}

async function writeReceipt({ opts, discovery, matrix, cells, staticExpected }: MatrixReceiptInput): Promise<string> {
  const path = await artifactFile("motion-audit", `${routeSlug(opts.route)}-matrix`, ".json");
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        discovery: { reachedRows: discovery.reachedRows, reachedSubjects: discovery.reachedSubjects },
        plan: matrix.plan.receipt,
        staticExpected,
        cells,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return path;
}

export async function runMotionAuditMatrix(opts: Args): Promise<number> {
  // @orb-gate-ignore caught-failure-ownership(empty:error): discovery/planning failures print the exact INSTRUMENT ERROR and return EXIT.toolError; no aggregate verdict is emitted. Ends if this catch stops terminating the command.
  try {
    const discovery = await discoverMatrix(opts);
    const matrix = planMotionAppearanceMatrix(discovery.contract, opts.selector);
    print(`MOTION MATRIX PLAN  cells=${matrix.plan.cells.length} pairs-uncovered=${matrix.plan.receipt.uncoveredPairs.length}`);
    const cells = await runCells(opts, matrix);
    const staticExpected = evaluateMotionStaticExpected(matrix.staticExpected, cells);
    print(
      `MOTION MATRIX STATIC  candidate=${staticExpected.candidateId} control=${staticExpected.controlId} status=${staticExpected.status} detail=${staticExpected.detail}`,
    );
    const effectiveCodes = cells.map((cell) => (cell.id === staticExpected.candidateId ? staticExpected.candidateCode : cell.code));
    const toolErrors = effectiveCodes.filter((code) => code === EXIT.toolError).length;
    const violations = effectiveCodes.filter((code) => code === EXIT.violations).length;
    const receipt = await writeReceipt({ opts, discovery, matrix, cells, staticExpected });
    const verdict = aggregateVerdict(toolErrors, violations);
    return printVerdict("motion-audit-matrix", {
      verdict,
      denominators: {
        variants: { value: matrix.plan.cells.length, refuseWhen: "zero" },
        "reached-subjects": { value: discovery.reachedSubjects, refuseWhen: "zero" },
      },
      pairs: [
        ["instrument-errors", toolErrors],
        ["violations", violations],
        ["uncovered-pairs", matrix.plan.receipt.uncoveredPairs.length],
        ["required-twins", matrix.plan.receipt.requiredTwins.length],
        ["static-expected", staticExpected.status === "static-expected" ? 1 : 0],
        ["static-candidate", staticExpected.candidateId],
        ["static-control", staticExpected.controlId],
        ["json", receipt],
      ],
    });
  } catch (error) {
    print(`INSTRUMENT ERROR  motion matrix discovery/planning failed: ${errorMessage(error)}`);
    return EXIT.toolError;
  }
}
