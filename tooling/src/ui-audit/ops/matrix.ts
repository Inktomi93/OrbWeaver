// --matrix: discover the live Appearance/theme contracts, then feed each representative assignment through
// design-audit's ordinary single-run verdict path. The shared planner owns coverage; this file owns only
// design-audit execution and its aggregate receipt.

import { writeFile } from "node:fs/promises";
import { errorMessage } from "@orb/kit/error-message";
import type { SettingsShimEvidence } from "../../_shared/appearance.ts";
import { appearanceReachReceipt, readRuntimeAppearanceContract } from "../../_shared/appearance-matrix.ts";
import { artifactFile, print, routeSlug } from "../../_shared/artifacts.ts";
import { buildUrl, launchProbeSession, withProbeSession } from "../../_shared/browser.ts";
import { readBrowserEnvironment } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { printVerdict } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { provisionRatedStageThemes } from "../../_shared/rated-theme-fixture.ts";
import type { ThemeEntry } from "../../_shared/theme.ts";
import { NO_THEME } from "../../_shared/theme.ts";
import type { Args } from "../contract/types.ts";
import { navigateAndReveal } from "./drive.ts";
import type { UiAuditAppearanceMatrix } from "./matrix-contract.ts";
import { planUiAuditAppearanceMatrix, uiAuditMatrixVariant } from "./matrix-contract.ts";
import { runUiAudit } from "./run.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit --matrix");

interface MatrixDiscovery {
  readonly contract: Awaited<ReturnType<typeof readRuntimeAppearanceContract>>;
  readonly themes: readonly ThemeEntry[];
  readonly settings: SettingsShimEvidence;
  readonly reachedRows: number;
  readonly reachedSubjects: number;
}

interface MatrixCellResult {
  readonly id: string;
  readonly code: number;
}

export interface UiAuditMatrixExitSummary {
  readonly verdict: number;
  readonly violations: number;
  readonly instrumentErrors: number;
}

export function aggregateUiAuditMatrixExit(codes: readonly number[]): UiAuditMatrixExitSummary {
  const violations = codes.filter((code) => code === EXIT.violations).length;
  const instrumentErrors = codes.filter((code) => code !== EXIT.clean && code !== EXIT.violations).length;
  let verdict: number = EXIT.clean;
  if (instrumentErrors > 0) {
    verdict = EXIT.toolError;
  } else if (violations > 0) {
    verdict = EXIT.violations;
  }
  return {
    verdict,
    violations,
    instrumentErrors,
  };
}

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

async function discoverMatrix(opts: Args): Promise<MatrixDiscovery> {
  const discoveryArgs: Args = {
    ...opts,
    matrix: false,
    appearance: null,
    theme: NO_THEME,
    device: null,
  };
  const session = await launchProbeSession({
    headless: true,
    viewport: discoveryArgs.viewport,
    device: discoveryArgs.device,
    colorScheme: null,
    reducedMotion: false,
    appearance: discoveryArgs.appearance,
    theme: discoveryArgs.theme,
    localStorage: [],
  });
  return await withProbeSession(session, async () => {
    const outcome = await navigateAndReveal(session.page, discoveryArgs, buildUrl(discoveryArgs.base, discoveryArgs.route));
    if (outcome.navError !== null || outcome.actionsFailed > 0 || !outcome.appReady) {
      return instrumentError(
        `design-audit matrix discovery did not reach the settled surface (nav=${outcome.navError ?? "ok"}, actions=${outcome.actionsFailed}, ready=${String(outcome.appReady)})`,
      );
    }
    const environment = await readBrowserEnvironment(session.page, session.environmentContract);
    if (environment.mismatches.length > 0) {
      return instrumentError(`design-audit matrix discovery browser mismatch: ${environment.mismatches.join("; ")}`);
    }
    const contract = await readRuntimeAppearanceContract(session.page);
    const reached = appearanceReachReceipt(contract);
    const settings = session.contexts[0]?.settingsEvidence;
    if (settings === undefined) {
      return instrumentError("design-audit matrix discovery has no settings-evidence owner");
    }
    if (settings.themeApplied !== true || settings.themeResolution?.request !== NO_THEME) {
      return instrumentError("design-audit matrix discovery did not resolve its authenticated theme-catalog request");
    }
    const themes = settings.themeCatalog;
    if (themes === null || themes.length === 0) {
      return instrumentError("design-audit matrix discovery returned an empty authenticated theme catalog");
    }
    return { contract, themes, settings, reachedRows: reached.rows, reachedSubjects: reached.subjects };
  });
}

function cellArgs(opts: Args, baseName: string, matrix: UiAuditAppearanceMatrix, index: number): Args {
  const cell = matrix.plan.cells[index];
  if (cell === undefined) {
    return instrumentError(`design-audit matrix is missing cell ${String(index)}`);
  }
  const variant = uiAuditMatrixVariant(matrix, cell, index);
  return {
    ...opts,
    matrix: false,
    out: `${baseName}-${variant.id}`,
    appearance: variant.appearance,
    theme: variant.theme,
    device: variant.device,
  };
}

async function runCells(opts: Args, baseName: string, matrix: UiAuditAppearanceMatrix): Promise<readonly MatrixCellResult[]> {
  const results: MatrixCellResult[] = [];
  for (let index = 0; index < matrix.plan.cells.length; index += 1) {
    const args = cellArgs(opts, baseName, matrix, index);
    const id = args.out?.slice(`${baseName}-`.length) ?? instrumentError(`design-audit matrix cell ${String(index)} has no artifact id`);
    print(`\n========== DESIGN MATRIX ${id} ==========`);
    results.push({ id, code: await runUiAudit(args) });
  }
  return results;
}

async function writeReceipt(
  baseName: string,
  discovery: MatrixDiscovery,
  matrix: UiAuditAppearanceMatrix,
  cells: readonly MatrixCellResult[],
): Promise<string> {
  const path = await artifactFile("design-audit", `${baseName}-matrix`, ".json");
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
        cells,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return path;
}

async function runRatedMatrix(opts: Args, preferredCustom: readonly [ThemeEntry, ThemeEntry] | null): Promise<number> {
  const baseName = opts.out ?? routeSlug(opts.route);
  const discovery = await discoverMatrix(opts);
  const matrix = planUiAuditAppearanceMatrix(discovery.contract, discovery.themes, preferredCustom);
  print(`DESIGN MATRIX PLAN  cells=${matrix.plan.cells.length} pairs-uncovered=${matrix.plan.receipt.uncoveredPairs.length}`);
  const cells = await runCells(opts, baseName, matrix);
  const failures = cells.filter((cell) => cell.code !== EXIT.clean).length;
  const summary = aggregateUiAuditMatrixExit(cells.map((cell) => cell.code));
  const receipt = await writeReceipt(baseName, discovery, matrix, cells);
  return printVerdict("design-audit-matrix", {
    verdict: summary.verdict,
    denominators: {
      variants: { value: matrix.plan.cells.length, refuseWhen: "zero" },
      "appearance-axes": { value: matrix.appearanceAxes.length, refuseWhen: "zero" },
      "reached-subjects": { value: discovery.reachedSubjects, refuseWhen: "zero" },
    },
    pairs: [
      ["failed", failures],
      ["instrument-errors", summary.instrumentErrors],
      ["violations", summary.violations],
      ["uncovered-pairs", matrix.plan.receipt.uncoveredPairs.length],
      ["required-rows", matrix.plan.receipt.requiredRows.length],
      ["required-twins", matrix.plan.receipt.requiredTwins.length],
      ["json", receipt],
    ],
  });
}

export async function runUiAuditMatrix(opts: Args): Promise<number> {
  let fixture: Awaited<ReturnType<typeof provisionRatedStageThemes>> = null;
  let verdict: number = EXIT.toolError;
  // @orb-gate-ignore caught-failure-ownership(empty:error): every lifecycle/discovery/planning failure is printed as INSTRUMENT ERROR and returned as EXIT.toolError below; cleanup still runs. Ends if this catch stops terminating the command.
  try {
    fixture = await provisionRatedStageThemes(opts.base, opts.isolated);
    verdict = await runRatedMatrix(opts, fixture?.entries ?? null);
  } catch (error) {
    print(`INSTRUMENT ERROR  design-audit matrix discovery/planning failed: ${errorMessage(error)}`);
  }
  if (fixture !== null) {
    // @orb-gate-ignore caught-failure-ownership(empty:error): cleanup failure is printed to the operator and forces EXIT.toolError below. Ends if cleanup is delegated to an owner that returns its own verdict.
    try {
      await fixture.cleanup();
    } catch (error) {
      print(`INSTRUMENT ERROR  design-audit matrix rated-theme cleanup failed: ${errorMessage(error)}`);
      verdict = EXIT.toolError;
    }
  }
  return verdict;
}
