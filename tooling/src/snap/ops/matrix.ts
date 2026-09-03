// --matrix: discover the live Appearance/theme contracts, plan one bounded representative set, and run
// every cell through Snap's ordinary capture path. Planning is shared; this loop owns only Snap policy.
import { writeFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { errorMessage } from "@orb/kit/error-message";
import type { SettingsShimEvidence } from "../../_shared/appearance.ts";
import { appearanceReachReceipt, readRuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { artifactFile } from "../../_shared/artifact-out.ts";
import { print, routeSlug } from "../../_shared/artifacts.ts";
import { buildUrl, withProbeSession } from "../../_shared/browser.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { loadResultPairs } from "../../_shared/load-budget.ts";
import { provisionRatedStageThemes } from "../../_shared/rated-theme-fixture.ts";
import type { ThemeEntry } from "../../_shared/theme.ts";
import { NO_THEME } from "../../_shared/theme.ts";
import type { AppearanceInvariantResult } from "../contract/appearance-invariants.ts";
import type { SnapAppearanceContract, SnapAppearanceMatrix, SnapMatrixVariant } from "../contract/matrix.ts";
import type { SnapDetailedResult, SnapRunReceipt } from "../contract/run.ts";
import type { Args } from "../contract/types.ts";
import { shouldProduceShot, variantOut } from "../lib/out-names.ts";
import { sameAppearanceReceiptPopulation } from "./appearance-invariants.ts";
import { navigate, settlePage } from "./drive.ts";
import { snapDestination } from "./guards.ts";
import { appearancePolicyIdForRequirement, historicalRowsForCell, planSnapAppearanceMatrix, snapMatrixVariant } from "./matrix-contract.ts";
import type { ScenarioMatrixAggregate } from "./matrix-scenario.ts";
import { reconcileScenarioMatrixEvidence, scenarioMatrixCellEvidence } from "./matrix-scenario.ts";
import { runOnSession, runSnapDetailed } from "./run.ts";
import { runScenarioDetailed } from "./scenario.ts";
import { finishSnapContext, launchSnapSession, openSnapMatrixContext } from "./session.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

interface MatrixDiscovery {
  readonly contract: SnapAppearanceContract;
  readonly themes: readonly ThemeEntry[];
  readonly reachedRows: number;
  readonly reachedSubjects: number;
  readonly settings: SettingsShimEvidence;
}

interface MatrixCellResult {
  readonly id: string;
  readonly code: number;
  readonly receipt: SnapRunReceipt;
  readonly invariants:
    | { readonly mode: "route-invariants"; readonly requiredRowIds: readonly string[] }
    | { readonly mode: "scenario-checkpoints"; readonly appearance: "not-applicable"; readonly reason: "scenario-owned-drive" };
}

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

function discoveryArgs(opts: Args): Args {
  return {
    ...opts,
    matrix: false,
    json: false,
    appearance: null,
    theme: NO_THEME,
    colorScheme: null,
    reducedMotion: false,
    browserContrast: "no-preference",
    reducedTransparency: false,
  };
}

async function discoverMatrixInputs(opts: Args, baseName: string, host: ProbeSession | null): Promise<MatrixDiscovery> {
  const args = discoveryArgs(opts);
  if (host !== null) {
    const navError = await navigate(host.page, args, buildUrl(args.base, args.route));
    await settlePage(host.page, args);
    if (navError !== null) {
      return instrumentError(`matrix discovery did not reach a settled app: ${navError}`);
    }
    const contract = (await readRuntimeAppearanceContract(host.page)) as SnapAppearanceContract;
    const reached = appearanceReachReceipt(contract);
    const settings = host.contexts[0]?.settingsEvidence;
    if (settings === undefined) {
      return instrumentError("matrix discovery has no settings-evidence owner");
    }
    if (settings.themeApplied !== true || settings.themeResolution?.request !== NO_THEME) {
      return instrumentError("matrix discovery did not resolve its authenticated theme-catalog request");
    }
    const themes = settings.themeCatalog;
    if (themes === null || themes.length === 0) {
      return instrumentError("matrix discovery returned an empty authenticated theme catalog");
    }
    return { contract, themes, reachedRows: reached.rows, reachedSubjects: reached.subjects, settings };
  }
  const session = await launchSnapSession(args, `${baseName}-matrix-discovery`);
  return await withProbeSession(session, async () => {
    const navError = await navigate(session.page, args, buildUrl(args.base, args.route));
    await settlePage(session.page, args);
    if (navError !== null) {
      return instrumentError(`matrix discovery did not reach a settled app: ${navError}`);
    }
    const contract = (await readRuntimeAppearanceContract(session.page)) as SnapAppearanceContract;
    const reached = appearanceReachReceipt(contract);
    const settings = session.contexts[0]?.settingsEvidence;
    if (settings === undefined) {
      return instrumentError("matrix discovery has no settings-evidence owner");
    }
    if (settings.themeApplied !== true || settings.themeResolution?.request !== NO_THEME) {
      return instrumentError("matrix discovery did not resolve its authenticated theme-catalog request");
    }
    const themes = settings.themeCatalog;
    if (themes === null || themes.length === 0) {
      return instrumentError("matrix discovery returned an empty authenticated theme catalog");
    }
    return { contract, themes, reachedRows: reached.rows, reachedSubjects: reached.subjects, settings };
  });
}

function runArgsForVariant(opts: Args, baseName: string, variant: SnapMatrixVariant): Args {
  return {
    ...opts,
    matrix: false,
    out: variantOut(baseName, variant.id),
    appearance: variant.appearance,
    theme: variant.theme,
    device: variant.device,
    colorScheme: variant.colorScheme,
    reducedMotion: variant.reducedMotion,
    browserContrast: variant.browserContrast,
    reducedTransparency: variant.reducedTransparency,
  };
}

async function runMatrixSessionCell(
  host: ProbeSession,
  runArgs: Args,
  variant: SnapMatrixVariant,
  appearanceRows: SnapAppearanceMatrix["historicalRows"],
): Promise<SnapDetailedResult> {
  const opened = await openSnapMatrixContext(host, runArgs, variant.id);
  const destination = snapDestination(runArgs);
  try {
    return await runOnSession(
      opened.session,
      runArgs,
      {
        url: destination.url,
        name: destination.name,
        out: await artifactFile("snaps", destination.name, ".png"),
        key: variant.id,
        produceShot: shouldProduceShot(runArgs),
        navigate: true,
      },
      {
        window: null,
        detailedPlan: { appearanceRows },
        finish: async (red) => await finishSnapContext(opened.context, red, variant.id, runArgs.failureEvidence),
      },
    );
  } catch (error) {
    await opened.context.context.close();
    throw error;
  }
}

async function runMatrixCells(opts: Args, baseName: string, matrix: SnapAppearanceMatrix, host: ProbeSession | null): Promise<readonly MatrixCellResult[]> {
  const results: MatrixCellResult[] = [];
  for (const [index, cell] of matrix.plan.cells.entries()) {
    const variant = snapMatrixVariant(matrix, cell, index);
    const runArgs = runArgsForVariant(opts, baseName, variant);
    print(`\n========== MATRIX ${variant.id} ==========`);
    const appearanceRows = runArgs.scenario === null ? historicalRowsForCell(matrix, cell.id) : [];
    let result: SnapDetailedResult;
    if (runArgs.scenario !== null) {
      result = await runScenarioDetailed(runArgs);
    } else if (host === null) {
      result = await runSnapDetailed(runArgs, { appearanceRows });
    } else {
      result = await runMatrixSessionCell(host, runArgs, variant, appearanceRows);
    }
    if (result.receipt === null) {
      return instrumentError(`matrix cell ${variant.id} returned no browser receipt`);
    }
    const invariants =
      runArgs.scenario === null
        ? { mode: "route-invariants" as const, requiredRowIds: appearanceRows.map((row) => row.id) }
        : { mode: "scenario-checkpoints" as const, appearance: "not-applicable" as const, reason: "scenario-owned-drive" as const };
    results.push({ id: variant.id, code: result.code, receipt: result.receipt, invariants });
  }
  return results;
}

interface MatrixReceiptInput {
  readonly opts: Args;
  readonly baseName: string;
  readonly discovery: MatrixDiscovery;
  readonly matrix: SnapAppearanceMatrix;
  readonly cells: readonly MatrixCellResult[];
  readonly mode: "route-invariants" | "scenario-checkpoints";
  readonly aggregate: AppearanceAggregate | ScenarioMatrixAggregate;
}

export interface AppearanceAggregate {
  readonly receipts: number;
  readonly subjects: number;
  readonly declared: number;
  readonly candidates: number;
  readonly reached: number;
  readonly sampled: number;
  readonly skipped: number;
  readonly occluded: number;
  readonly offViewport: number;
  readonly pixels: number;
  readonly pixelSamples: number;
  readonly cascades: number;
}

function aggregateAppearance(results: readonly AppearanceInvariantResult[]): AppearanceAggregate {
  return {
    receipts: results.length,
    subjects: results.reduce((sum, result) => sum + result.receipt.subjects.length, 0),
    declared: results.reduce((sum, result) => sum + result.evaluation.accounting.declared, 0),
    candidates: results.reduce((sum, result) => sum + result.evaluation.accounting.candidates, 0),
    reached: results.reduce((sum, result) => sum + result.evaluation.accounting.reached, 0),
    sampled: results.reduce((sum, result) => sum + result.evaluation.accounting.sampled, 0),
    skipped: results.reduce((sum, result) => sum + result.evaluation.accounting.skipped.reduce((count, row) => count + row.count, 0), 0),
    occluded: results.reduce((sum, result) => sum + result.evaluation.accounting.occluded, 0),
    offViewport: results.reduce((sum, result) => sum + result.evaluation.accounting.offViewport, 0),
    pixels: results.reduce((sum, result) => sum + result.receipt.pixels.length, 0),
    pixelSamples: results.reduce((sum, result) => sum + result.receipt.pixels.reduce((count, pixel) => count + pixel.sampled, 0), 0),
    cascades: results.reduce((sum, result) => sum + result.receipt.cascade.length, 0),
  };
}

export function reconcileAppearanceAggregate(aggregate: AppearanceAggregate): void {
  if (
    aggregate.receipts <= 0 ||
    aggregate.subjects <= 0 ||
    aggregate.declared <= 0 ||
    aggregate.reached <= 0 ||
    aggregate.sampled <= 0 ||
    aggregate.pixels <= 0 ||
    aggregate.cascades <= 0
  ) {
    instrumentError(`matrix appearance aggregate has a blind denominator: ${JSON.stringify(aggregate)}`);
  }
  if (aggregate.subjects !== aggregate.declared) {
    instrumentError(`matrix appearance subjects=${aggregate.subjects} != declared=${aggregate.declared}`);
  }
  if (aggregate.candidates !== aggregate.reached + aggregate.skipped) {
    instrumentError(`matrix appearance candidates=${aggregate.candidates} != reached=${aggregate.reached} + skipped=${aggregate.skipped}`);
  }
  if (aggregate.reached !== aggregate.sampled + aggregate.occluded + aggregate.offViewport) {
    instrumentError(
      `matrix appearance reached=${aggregate.reached} != sampled=${aggregate.sampled} + occluded=${aggregate.occluded} + offViewport=${aggregate.offViewport}`,
    );
  }
  if (aggregate.pixelSamples !== aggregate.pixels) {
    instrumentError(`matrix appearance pixel samples=${aggregate.pixelSamples} != declared pixels=${aggregate.pixels}`);
  }
}

async function writeMatrixReceipt({ opts, baseName, discovery, matrix, cells, mode, aggregate }: MatrixReceiptInput): Promise<string | null> {
  if (!opts.json) {
    return null;
  }
  const path = await artifactFile("snaps", `${baseName}-matrix`, ".json");
  await writeFile(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        discovery: {
          reachedRows: discovery.reachedRows,
          reachedSubjects: discovery.reachedSubjects,
          themeResolution: discovery.settings.themeResolution,
          themeCatalog: discovery.themes,
        },
        dependencies: discovery.contract.dependencies,
        plan: matrix.plan.receipt,
        mode,
        aggregate,
        cells,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return path;
}

interface FinishScenarioMatrixInput {
  readonly opts: Args;
  readonly baseName: string;
  readonly discovery: MatrixDiscovery;
  readonly matrix: SnapAppearanceMatrix;
  readonly cells: readonly MatrixCellResult[];
}

async function finishScenarioMatrix({ opts, baseName, discovery, matrix, cells }: FinishScenarioMatrixInput): Promise<number> {
  const evidence = cells.map((cell) => scenarioMatrixCellEvidence(cell.id, cell.receipt));
  const aggregate = reconcileScenarioMatrixEvidence(evidence, matrix.plan.cells.length, opts.json);
  const failures = cells.filter((cell) => cell.code !== 0).length;
  const receipt = await writeMatrixReceipt({ opts, baseName, discovery, matrix, cells, mode: "scenario-checkpoints", aggregate });
  return printVerdict("snap-matrix", {
    verdict: failures > 0 ? EXIT.violations : EXIT.clean,
    denominators: {
      variants: { value: matrix.plan.cells.length, refuseWhen: "zero" },
      "appearance-axes": { value: matrix.appearanceAxes.length, refuseWhen: "zero" },
      "scenario-checkpoints-declared": { value: aggregate.declared, refuseWhen: "zero" },
      "scenario-checkpoints-captured": { value: aggregate.captured, refuseWhen: "zero" },
    },
    pairs: [
      ["mode", "scenario-checkpoints"],
      ["variants", matrix.plan.cells.length],
      ["failed", failures],
      ["uncovered-pairs", matrix.plan.receipt.uncoveredPairs.length],
      ["scenario-declared", aggregate.declared],
      ["scenario-captured", aggregate.captured],
      ["scenario-manifests", aggregate.manifests],
      ["appearance", "not-applicable:scenario-owned-drive"],
      ["json", receipt ?? "none"],
      ...loadResultPairs(),
    ],
  });
}

async function runRatedMatrix(opts: Args, preferredCustom: readonly [ThemeEntry, ThemeEntry] | null, host: ProbeSession | null): Promise<number> {
  const destination = snapDestination(opts);
  const baseName = opts.out ?? (opts.scenario === null ? routeSlug(opts.route) : routeSlug(basename(opts.scenario, extname(opts.scenario))));
  const discovery = await discoverMatrixInputs(opts, baseName, host);
  const matrix = planSnapAppearanceMatrix(discovery.contract, discovery.themes, preferredCustom);
  print(`MATRIX PLAN  target=${destination.url} cells=${matrix.plan.cells.length} pairs-uncovered=${matrix.plan.receipt.uncoveredPairs.length}`);
  print(
    `MATRIX INPUT declared=${discovery.contract.declared} executable=${discovery.contract.executable} dependencies=${discovery.contract.dependencies} ` +
      `reached-rows=${discovery.reachedRows} reached-subjects=${discovery.reachedSubjects} themes=${discovery.themes.length}`,
  );
  const cells = await runMatrixCells(opts, baseName, matrix, host);
  if (opts.scenario !== null) {
    return await finishScenarioMatrix({ opts, baseName, discovery, matrix, cells });
  }
  const failures = cells.filter((cell) => cell.code !== 0).length;
  const appearance = cells.flatMap((cell) => cell.receipt.appearance);
  const expectedAppearanceReceipts = matrix.plan.receipt.requiredRows.length + matrix.plan.receipt.requiredTwins.length * 2;
  if (appearance.length !== expectedAppearanceReceipts) {
    return instrumentError(`matrix appearance receipt population=${appearance.length} expected=${expectedAppearanceReceipts}`);
  }
  const expectedRowIds = [
    ...matrix.plan.receipt.requiredRows.map((row) => appearancePolicyIdForRequirement(row.id)),
    ...matrix.plan.receipt.requiredTwins.flatMap((row) => {
      const id = appearancePolicyIdForRequirement(row.id);
      return [id, id];
    }),
  ];
  const actualRowIds = appearance.map((result) => result.receipt.rowId);
  if (!sameAppearanceReceiptPopulation(expectedRowIds, actualRowIds)) {
    return instrumentError(`matrix historical receipt membership differs: expected=${expectedRowIds.join(",")} actual=${actualRowIds.join(",")}`);
  }
  const aggregate = aggregateAppearance(appearance);
  reconcileAppearanceAggregate(aggregate);
  const appearanceInstrumentErrors = appearance.filter((result) => result.evaluation.status === "instrument-error").length;
  const appearanceViolations = appearance.filter((result) => result.evaluation.status === "violations").length;
  const mergeRequired = appearance.reduce((sum, result) => sum + result.evaluation.mergeRequired, 0);
  const mergeDirectCarrier = appearance.reduce((sum, result) => sum + result.evaluation.mergeDirectCarrier, 0);
  if (mergeRequired + mergeDirectCarrier !== appearance.length) {
    return instrumentError(`matrix merge accounting required=${mergeRequired} direct=${mergeDirectCarrier} receipts=${appearance.length}`);
  }
  const receipt = await writeMatrixReceipt({ opts, baseName, discovery, matrix, cells, mode: "route-invariants", aggregate });
  let verdict: number = EXIT.clean;
  if (appearanceInstrumentErrors > 0) {
    verdict = EXIT.toolError;
  } else if (failures > 0) {
    verdict = EXIT.violations;
  }
  return printVerdict("snap-matrix", {
    verdict,
    denominators: {
      variants: { value: matrix.plan.cells.length, refuseWhen: "zero" },
      "appearance-axes": { value: matrix.appearanceAxes.length, refuseWhen: "zero" },
      "reached-subjects": { value: discovery.reachedSubjects, refuseWhen: "zero" },
      "historical-receipts": { value: appearance.length, refuseWhen: "zero" },
      "historical-declared": { value: aggregate.declared, refuseWhen: "zero" },
      "historical-reached": { value: aggregate.reached, refuseWhen: "zero" },
      "historical-sampled": { value: aggregate.sampled, refuseWhen: "zero" },
    },
    pairs: [
      ["variants", matrix.plan.cells.length],
      ["failed", failures],
      ["uncovered-pairs", matrix.plan.receipt.uncoveredPairs.length],
      ["required-rows", matrix.plan.receipt.requiredRows.length],
      ["required-twins", matrix.plan.receipt.requiredTwins.length],
      ["appearance-instrument-errors", appearanceInstrumentErrors],
      ["appearance-violations", appearanceViolations],
      ["appearance-candidates", aggregate.candidates],
      ["appearance-reached", aggregate.reached],
      ["appearance-sampled", aggregate.sampled],
      ["appearance-skipped", aggregate.skipped],
      ["appearance-occluded", aggregate.occluded],
      ["appearance-offviewport", aggregate.offViewport],
      ["appearance-pixels", aggregate.pixels],
      ["appearance-pixel-samples", aggregate.pixelSamples],
      ["appearance-cascades", aggregate.cascades],
      ["merge-required", mergeRequired],
      ["merge-direct-carrier", mergeDirectCarrier],
      ["json", receipt ?? "none"],
      ...loadResultPairs(),
    ],
  });
}

export async function snapMatrix(opts: Args): Promise<number> {
  return await snapMatrixOnSession(opts, null);
}

/** The session host differs only in browser ownership: discovery uses the daemon's neutral context and
 *  each rated cell gets a disposable isolated context in that same Chromium. Planning, evidence and
 *  aggregate output stay byte-for-byte on the ordinary matrix path. */
export async function snapMatrixOnSession(opts: Args, host: ProbeSession | null): Promise<number> {
  let fixture: Awaited<ReturnType<typeof provisionRatedStageThemes>> = null;
  let verdict: number = EXIT.toolError;
  // @orb-gate-ignore caught-failure-ownership(empty:error): every lifecycle/discovery/planning failure is printed as INSTRUMENT ERROR and returned as EXIT.toolError below; cleanup still runs. Ends if this catch stops terminating the command.
  try {
    fixture = await provisionRatedStageThemes(opts.base, opts.isolated);
    verdict = await runRatedMatrix(opts, fixture?.entries ?? null, host);
  } catch (error) {
    print(`INSTRUMENT ERROR  snap matrix discovery/planning failed: ${errorMessage(error)}`);
  }
  if (fixture !== null) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): cleanup failure is printed to the operator and forces EXIT.toolError below. Ends if cleanup is delegated to an owner that returns its own verdict.
    try {
      await fixture.cleanup();
    } catch (error) {
      print(`INSTRUMENT ERROR  snap matrix rated-theme cleanup failed: ${errorMessage(error)}`);
      verdict = EXIT.toolError;
    }
  }
  return verdict;
}
