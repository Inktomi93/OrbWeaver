import type { AppearanceAggregate } from "../../../../tooling/src/snap/lib/matrix-appearance.ts";
import { reconcileAppearanceAggregate } from "../../../../tooling/src/snap/lib/matrix-appearance.ts";
import type { ScenarioMatrixCellEvidence } from "../../../../tooling/src/snap/ops/matrix-scenario.ts";
import { reconcileScenarioMatrixEvidence } from "../../../../tooling/src/snap/ops/matrix-scenario.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const complete: AppearanceAggregate = {
  receipts: 2,
  subjects: 4,
  declared: 4,
  candidates: 5,
  reached: 4,
  sampled: 3,
  skipped: 1,
  occluded: 1,
  offViewport: 0,
  pixels: 2,
  pixelSamples: 2,
  cascades: 3,
};

test("the rated matrix reconciles every structured appearance population", () => {
  expect(() => reconcileAppearanceAggregate(complete)).not.toThrow();
});

test("same-count subject substitution and blind pixel/cascade populations fail loud", () => {
  expect(() => reconcileAppearanceAggregate({ ...complete, subjects: 3 })).toThrow("subjects=3 != declared=4");
  expect(() => reconcileAppearanceAggregate({ ...complete, pixels: 0, pixelSamples: 0 })).toThrow("blind denominator");
  expect(() => reconcileAppearanceAggregate({ ...complete, cascades: 0 })).toThrow("blind denominator");
});

const scenarioCell: ScenarioMatrixCellEvidence = {
  cellId: "v01",
  declaredCheckpointNames: ["home", "chat"],
  capturedCheckpointNames: ["home", "chat"],
  browserEvidence: 1,
  settingsEvidence: 1,
  appearanceReceipts: 0,
  manifestPath: "/tmp/v01.json",
};

test("scenario matrix cells reconcile the ordered checkpoint and evidence populations", () => {
  expect(reconcileScenarioMatrixEvidence([scenarioCell], 1, true)).toEqual({ cells: 1, declared: 2, captured: 2, manifests: 1 });
});

// @instrument-proof: the scenario arm must not look green merely because runScenarioDetailed returned a
// numeric code. Missing/partial checkpoints or a requested-but-unwritten manifest are blind evidence,
// and R1-R7 receipts are forbidden because the JSON did not execute their literal drives.
test("scenario matrix cells fail loud on partial evidence and accidental R1-R7 claims", () => {
  expect(() => reconcileScenarioMatrixEvidence([{ ...scenarioCell, capturedCheckpointNames: ["home"] }], 1, true)).toThrow("declared checkpoints");
  expect(() => reconcileScenarioMatrixEvidence([{ ...scenarioCell, manifestPath: null }], 1, true)).toThrow("manifest");
  expect(() => reconcileScenarioMatrixEvidence([{ ...scenarioCell, appearanceReceipts: 1 }], 1, true)).toThrow("appearance receipts");
});
