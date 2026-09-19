import { readFileSync } from "node:fs";
import { vi } from "vitest";
import { appearanceMatrixContract } from "../../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import type { ThemeEntry } from "../../../../tooling/src/_shared/theme.ts";
import { APPEARANCE_HIGH_RISK_PRESET_NAMES, scenarioPresetFile } from "../../../../tooling/src/snap/contract/scenario-presets.ts";
import { parseScenarioSpec, parseSnapArgs } from "../../../../tooling/src/snap/index.ts";
import {
  appearancePolicyIdForRequirement,
  historicalRowsForCell,
  planSnapAppearanceMatrix,
  snapMatrixVariant,
} from "../../../../tooling/src/snap/ops/matrix-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const THEMES = [
  { id: "seed-light", name: "Light", isSeed: true, background: "#ffffff", polarity: "light", hasCustomCss: false },
  { id: "seed-dark", name: "Hearth", isSeed: true, background: "#111111", polarity: "dark", hasCustomCss: false },
  { id: "custom-light", name: "Paper", isSeed: false, background: "#f7f3eb", polarity: "light", hasCustomCss: true },
  { id: "custom-dark", name: "Ink", isSeed: false, background: "#161821", polarity: "dark", hasCustomCss: true },
] as const satisfies readonly ThemeEntry[];
const MATRIX_TEST_TIMEOUT_MS = scaledBudget(60_000); // measured 22.3s at load ~30 (2026-09-02 fold train), 14s quiet
// Every case here plans the full carrier x theme matrix (3-7s each on a quiet box); on the contended box the
// battery runs on, the 5s default timed out 5 of 7 in one run — the budget applies to the whole file, not
// only the identity case that first needed it (#1008).
vi.setConfig({ testTimeout: MATRIX_TEST_TIMEOUT_MS });
const MINTED_CUSTOM_THEMES = [THEMES[2], THEMES[3]] as const;

test("ships stage-safe behavioral tapes for every historical Appearance row", () => {
  const specs = APPEARANCE_HIGH_RISK_PRESET_NAMES.map((name) => {
    const file = scenarioPresetFile(name);
    expect(file).not.toBeNull();
    const source = readFileSync(new URL(`../../../../tooling/src/snap/ops/scenarios/${String(file)}`, import.meta.url), "utf8");
    return parseScenarioSpec(source, name);
  });
  const checkpoints = specs.flatMap((spec) => spec.checkpoints);
  const expectedRows = appearanceMatrixContract().historicalRows.map((row) => row.id);

  expect(checkpoints.map((checkpoint) => checkpoint.name).sort()).toEqual([...expectedRows].sort());
  expect(new Set(checkpoints.map((checkpoint) => checkpoint.name)).size).toBe(checkpoints.length);
  for (const spec of specs) {
    for (const checkpoint of spec.checkpoints) {
      const args = parseSnapArgs([...spec.defaults, ...checkpoint.args], { scenarioCheckpoint: true });
      expect(args.errors).toEqual([]);
      expect(args.actions.some((action) => action.type === "nav" || action.type === "step")).toBe(true);
    }
  }
  expect(checkpoints.flatMap((checkpoint) => checkpoint.args)).not.toEqual(
    expect.arrayContaining(["--fill", "--upload", "--drop-files", "--click", "--dom-click", "--force-click", "--hover"]),
  );
  expect(specs[0]?.checkpoints[0]?.name).toBe("opposite-os-app-prepaint");
});

test("keeps the exact minted custom themes when an older capable stage row sorts first", () => {
  const stale = [
    { ...THEMES[2], id: "aaa-stale-light" },
    { ...THEMES[3], id: "aaa-stale-dark" },
  ] satisfies readonly ThemeEntry[];
  const matrix = planSnapAppearanceMatrix(appearanceMatrixContract(), [...stale, ...THEMES], MINTED_CUSTOM_THEMES);

  expect(matrix.themes["custom-light"]?.id).toBe("custom-light");
  expect(matrix.themes["custom-dark"]?.id).toBe("custom-dark");
  expect(() => planSnapAppearanceMatrix(appearanceMatrixContract(), THEMES, [{ ...THEMES[2], id: "missing-minted-light" }, THEMES[3]])).toThrow(
    "INSTRUMENT ERROR: preferred custom-light theme missing-minted-light is absent from the authenticated catalog",
  );
});

test("derives the rated Snap matrix from the live carrier contract and theme catalog", () => {
  const planned = planSnapAppearanceMatrix(appearanceMatrixContract(), THEMES);

  // 16 → 14 with the `kind:"seeded"` retirement (2026-09-18). The COUNT is derived, never a target:
  // what it actually asserts is that the planner is deterministic, and the coverage claim below
  // (`uncoveredPairs === []`) is what says the smaller plan still reaches every pair. The background
  // arm moved `none|seeded` → `none|asset`, and the risk row that pins it moved with it, so the same
  // required rows pack into two fewer cells.
  expect(planned.plan.cells).toHaveLength(14);
  expect(new Set(planned.plan.receipt.cellIds).size).toBe(planned.plan.cells.length);
  expect(planned.plan.receipt.uncoveredPairs).toEqual([]);
  expect(planned.appearanceAxes).toHaveLength(36);
  // 5 → 4: `backgroundSeededId` left `AppearanceSettings` with the retired kind, and it was a
  // DEPENDENCY row (no arms), so the executable-axis count above is unchanged.
  expect(planned.dependencies).toHaveLength(4);
  expect(planned.historicalRows).toHaveLength(7);
  expect(planned.plan.receipt.requiredRows.map((row) => row.id)).toEqual([
    "compact-portal-carried",
    "dark-name-time-short-bubble",
    "light-art-scrim-glass-elevation",
    "mobile-compact-large-document",
    "opposite-os-app-prepaint::dark-on-light",
    "opposite-os-app-prepaint::light-on-dark",
  ]);
  expect(planned.plan.receipt.requiredTwins.map((twin) => twin.id)).toEqual(["hover-pointer", "density-preview"]);
});

test("joins every mandatory historical row to its exact planner cell or twin endpoints", () => {
  const matrix = planSnapAppearanceMatrix(appearanceMatrixContract(), THEMES);
  const joined = matrix.plan.cells.flatMap((cell) => historicalRowsForCell(matrix, cell.id).map((row) => row.id));

  for (const row of matrix.plan.receipt.requiredRows) {
    expect(historicalRowsForCell(matrix, row.cellId).map((candidate) => candidate.id)).toContain(appearancePolicyIdForRequirement(row.id));
  }
  const oppositeRows = matrix.plan.receipt.requiredRows.filter((row) => row.id.startsWith("opposite-os-app-prepaint::"));
  expect(oppositeRows.map((row) => matrix.plan.cells.find((cell) => cell.id === row.cellId)?.assignment)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ theme: "custom-dark", "os-color": "light" }),
      expect.objectContaining({ theme: "custom-light", "os-color": "dark" }),
    ]),
  );
  for (const twin of matrix.plan.receipt.requiredTwins) {
    expect(joined.filter((id) => id === twin.id)).toHaveLength(2);
  }
  const hoverTwin = matrix.plan.receipt.requiredTwins.find((twin) => twin.id === "hover-pointer");
  const hoverAssignments = matrix.plan.cells
    .filter((cell) => cell.id === hoverTwin?.leftCellId || cell.id === hoverTwin?.rightCellId)
    .map((cell) => cell.assignment);
  expect(hoverAssignments).toHaveLength(2);
  expect(hoverAssignments.map((assignment) => assignment["device"])).toEqual(expect.arrayContaining(["desktop-fine-hover", "mobile-coarse-none"]));
  expect(hoverAssignments.every((assignment) => assignment["appearance.readingBodyScale"] === "0.8")).toBe(true);
  expect(hoverAssignments.every((assignment) => assignment["appearance.readingLineHeight"] === "1.2")).toBe(true);
  // #2437 — THE POPULATION>0 PIN. Both endpoints must also hold the ROOT SCALE at its born value: measured
  // on the v05 cell's own patch, `fontScale` 1.25 on the phone endpoint turns every visible header sticky,
  // which empties `:not([data-sticky])` and takes the row's ENTIRE subject census to population 0 (bubble,
  // name-row, actions-slot, actions-row, action-buttons, message-carrier — all of them). The cell then has
  // no verdict and, because a refused row throws, every LATER cell of the run goes unmeasured. Without this
  // assertion the pin is one pairwise reshuffle away from silently disappearing again.
  expect(hoverAssignments.every((assignment) => assignment["appearance.fontScale"] === "1")).toBe(true);
  const densityTwin = matrix.plan.receipt.requiredTwins.find((twin) => twin.id === "density-preview");
  const densityAssignments = matrix.plan.cells
    .filter((cell) => cell.id === densityTwin?.leftCellId || cell.id === densityTwin?.rightCellId)
    .map((cell) => cell.assignment);
  expect(densityAssignments).toHaveLength(2);
  expect(densityAssignments.every((assignment) => assignment["device"] === "mobile-coarse-none")).toBe(true);
  const artRow = matrix.plan.receipt.requiredRows.find((row) => row.id === "light-art-scrim-glass-elevation");
  expect(matrix.plan.cells.find((cell) => cell.id === artRow?.cellId)?.assignment).toMatchObject({
    device: "desktop-fine-hover",
    transparency: "full",
  });
  expect(
    matrix.plan.cells
      .filter((cell) => cell.assignment["device"] === "mobile-coarse-none")
      .flatMap((cell) => historicalRowsForCell(matrix, cell.id).map((row) => row.id)),
  ).not.toContain("light-art-scrim-glass-elevation");
  const mobileConfigRows = matrix.plan.cells
    .filter((cell) => cell.assignment["device"] === "mobile-coarse-none")
    .flatMap((cell) => historicalRowsForCell(matrix, cell.id).filter((row) => row.surface === "config-sizing"));
  expect(mobileConfigRows.map((row) => row.id)).toContain("compact-portal-carried");
  expect(() =>
    historicalRowsForCell({ ...matrix, historicalRows: matrix.historicalRows.slice(1) }, matrix.plan.receipt.requiredRows[0]?.cellId ?? "missing"),
  ).toThrow("cannot resolve every required historical row");
});

test("refuses a blind or partial carrier/theme contract instead of planning a plausible matrix", () => {
  const contract = appearanceMatrixContract();
  expect(() => planSnapAppearanceMatrix({ ...contract, executable: 0, rows: [] }, THEMES)).toThrow("INSTRUMENT ERROR");
  expect(() =>
    planSnapAppearanceMatrix(
      contract,
      THEMES.filter((theme) => theme.id !== "custom-dark"),
    ),
  ).toThrow("INSTRUMENT ERROR: theme catalog is missing custom-dark");
  expect(() =>
    planSnapAppearanceMatrix(
      contract,
      THEMES.map((theme) => (theme.id === "custom-light" ? { ...theme, hasCustomCss: false } : theme)),
    ),
  ).toThrow("INSTRUMENT ERROR: theme catalog is missing custom-light with custom CSS");
});

test("projects a planned cell onto the existing Snap settings and full browser descriptor rails", () => {
  const matrix = planSnapAppearanceMatrix(appearanceMatrixContract(), THEMES);
  const cell = matrix.plan.cells[0];
  expect(cell).toBeDefined();
  const variant = snapMatrixVariant(matrix, cell as (typeof matrix.plan.cells)[number]);

  // The `asset` arm completes THREE dependent carriers from the live background capability; every other
  // arm completes none, so the executable-axis count is the floor and the asset cell carries three more.
  const assetDependencies = ["backgroundAssetId", "backgroundAssetHash", "backgroundAssetMime"];
  expect(Object.keys(variant.appearance).filter((key) => !assetDependencies.includes(key))).toHaveLength(36);
  for (const key of assetDependencies) {
    expect(typeof variant.appearance[key]).toBe(variant.appearance["backgroundImageKind"] === "asset" ? "string" : "undefined");
  }
  expect(THEMES.map((theme) => theme.id)).toContain(variant.theme);
  expect([null, "iPhone 14 Pro Max"]).toContain(variant.device);
  expect(["light", "dark"]).toContain(variant.colorScheme);
  expect([false, true]).toContain(variant.reducedMotion);
  expect(["more", "no-preference"]).toContain(variant.browserContrast);
  expect([false, true]).toContain(variant.reducedTransparency);
});

test(
  "a same-count arm replacement changes matrix identity",
  () => {
    const contract = appearanceMatrixContract();
    const original = planSnapAppearanceMatrix(contract, THEMES);
    const rows = contract.rows.map((row) => (row.key === "avatarRing" ? { ...row, arms: ["none", "halo"] as const } : row));
    const replacement = planSnapAppearanceMatrix({ ...contract, rows }, THEMES);

    expect(replacement.plan.cells).toHaveLength(original.plan.cells.length);
    expect(replacement.plan.receipt.cellIds).not.toEqual(original.plan.receipt.cellIds);
  },
  MATRIX_TEST_TIMEOUT_MS,
);
