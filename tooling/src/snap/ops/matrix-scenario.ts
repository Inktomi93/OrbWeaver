// Scenario×matrix evidence: the JSON owns its route/actions, so R1–R7 are explicitly not applicable.
// This reconciler proves every derived cell still ran the complete named checkpoint population with
// actual browser/settings evidence and, when requested, a durable per-cell manifest.

import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SnapRunReceipt } from "../contract/run.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix --scenario <json|preset>");

export interface ScenarioMatrixCellEvidence {
  readonly cellId: string;
  readonly declaredCheckpointNames: readonly string[];
  readonly capturedCheckpointNames: readonly string[];
  readonly browserEvidence: number;
  readonly settingsEvidence: number;
  readonly appearanceReceipts: number;
  readonly manifestPath: string | null;
}

export interface ScenarioMatrixAggregate {
  readonly cells: number;
  readonly declared: number;
  readonly captured: number;
  readonly manifests: number;
}

function instrumentError(message: string): never {
  throw new Error(`INSTRUMENT ERROR: ${message}`);
}

export function scenarioMatrixCellEvidence(cellId: string, receipt: SnapRunReceipt): ScenarioMatrixCellEvidence {
  const scenario = receipt.scenario;
  if (scenario === null) {
    return instrumentError(`scenario matrix cell ${cellId} returned no scenario receipt`);
  }
  return {
    cellId,
    declaredCheckpointNames: scenario.declaredCheckpointNames,
    capturedCheckpointNames: scenario.capturedCheckpointNames,
    browserEvidence: receipt.browser.length,
    settingsEvidence: receipt.settings.length,
    appearanceReceipts: receipt.appearance.length,
    manifestPath: scenario.manifestPath,
  };
}

function reconcileScenarioCell(cell: ScenarioMatrixCellEvidence, requireManifest: boolean): void {
  if (cell.declaredCheckpointNames.length === 0) {
    instrumentError(`scenario matrix cell ${cell.cellId} has zero declared checkpoints`);
  }
  if (JSON.stringify(cell.declaredCheckpointNames) !== JSON.stringify(cell.capturedCheckpointNames)) {
    instrumentError(
      `scenario matrix cell ${cell.cellId} declared checkpoints=${JSON.stringify(cell.declaredCheckpointNames)} ` +
        `captured=${JSON.stringify(cell.capturedCheckpointNames)}`,
    );
  }
  if (cell.browserEvidence <= 0 || cell.settingsEvidence <= 0) {
    instrumentError(`scenario matrix cell ${cell.cellId} has blind browser/settings evidence=${cell.browserEvidence}/${cell.settingsEvidence}`);
  }
  if (cell.appearanceReceipts !== 0) {
    instrumentError(`scenario matrix cell ${cell.cellId} returned ${cell.appearanceReceipts} accidental R1-R7 appearance receipts`);
  }
  if (requireManifest && cell.manifestPath === null) {
    instrumentError(`scenario matrix cell ${cell.cellId} did not retain its requested JSON manifest`);
  }
}

export function reconcileScenarioMatrixEvidence(
  cells: readonly ScenarioMatrixCellEvidence[],
  expectedCells: number,
  requireManifest: boolean,
): ScenarioMatrixAggregate {
  if (expectedCells <= 0 || cells.length !== expectedCells) {
    return instrumentError(`scenario matrix cells=${cells.length} expected=${expectedCells}`);
  }
  if (new Set(cells.map((cell) => cell.cellId)).size !== cells.length) {
    return instrumentError("scenario matrix cell identities are not unique");
  }
  for (const cell of cells) {
    reconcileScenarioCell(cell, requireManifest);
  }
  return {
    cells: cells.length,
    declared: cells.reduce((sum, cell) => sum + cell.declaredCheckpointNames.length, 0),
    captured: cells.reduce((sum, cell) => sum + cell.capturedCheckpointNames.length, 0),
    manifests: cells.filter((cell) => cell.manifestPath !== null).length,
  };
}
