import { appearanceMatrixContract } from "../../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import type { ThemeEntry } from "../../../../tooling/src/_shared/theme.ts";
import { planUiAuditAppearanceMatrix, uiAuditMatrixVariant } from "../../../../tooling/src/ui-audit/ops/matrix-contract.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const THEMES = [
  { id: "seed-light", name: "Light", isSeed: true, background: "#ffffff", polarity: "light", hasCustomCss: false },
  { id: "seed-dark", name: "Hearth", isSeed: true, background: "#111111", polarity: "dark", hasCustomCss: false },
  { id: "custom-light", name: "Paper", isSeed: false, background: "#f7f3eb", polarity: "light", hasCustomCss: true },
  { id: "custom-dark", name: "Ink", isSeed: false, background: "#161821", polarity: "dark", hasCustomCss: true },
] as const satisfies readonly ThemeEntry[];

// The real 36-axis minimizer is the behavior under test. It measures ~4.3s alone and 5.2s beside four
// workers on the shared host, so Vitest's 5s default cuts through healthy work. This is a deadline for
// the owning integration-sized unit, not a retry or a smaller/fabricated planner input.
const MATRIX_PLANNER_TIMEOUT_MS = scaledBudget(60_000); // measured 22.3s at load ~30 (2026-09-02 fold train), 14s quiet
const MINTED_CUSTOM_THEMES = [THEMES[2], THEMES[3]] as const;

test(
  "derives the rated 13-cell design-audit matrix from live Appearance and theme contracts",
  () => {
    const matrix = planUiAuditAppearanceMatrix(appearanceMatrixContract(), THEMES);
    expect(matrix.plan.cells).toHaveLength(13);
    expect(new Set(matrix.plan.receipt.cellIds).size).toBe(matrix.plan.cells.length);
    expect(matrix.plan.receipt.uncoveredPairs).toEqual([]);
    expect(matrix.appearanceAxes).toHaveLength(36);
    expect(matrix.dependencies).toHaveLength(5);

    const first = matrix.plan.cells[0];
    if (first === undefined) {
      throw new Error("INSTRUMENT ERROR: rated design-audit matrix is empty");
    }
    const variant = uiAuditMatrixVariant(matrix, first);
    expect(Object.keys(variant.appearance).filter((key) => key !== "backgroundSeededId")).toHaveLength(36);
    expect(typeof variant.appearance["backgroundSeededId"]).toBe(variant.appearance["backgroundImageKind"] === "seeded" ? "string" : "undefined");
    expect(THEMES.map((theme) => theme.id)).toContain(variant.theme);
    expect([null, "iPhone 14 Pro Max"]).toContain(variant.device);
  },
  MATRIX_PLANNER_TIMEOUT_MS,
);

test("refuses a catalog missing a required custom polarity", () => {
  expect(() =>
    planUiAuditAppearanceMatrix(
      appearanceMatrixContract(),
      THEMES.filter((theme) => theme.id !== "custom-light"),
    ),
  ).toThrow("INSTRUMENT ERROR: theme catalog is missing custom-light");
});

test(
  "uses the exact run-minted custom themes instead of an older cached stage row",
  () => {
    const stale = [
      { ...THEMES[2], id: "aaa-stale-light" },
      { ...THEMES[3], id: "aaa-stale-dark" },
    ] satisfies readonly ThemeEntry[];
    const matrix = planUiAuditAppearanceMatrix(appearanceMatrixContract(), [...stale, ...THEMES], MINTED_CUSTOM_THEMES);

    expect(matrix.themes["custom-light"]?.id).toBe("custom-light");
    expect(matrix.themes["custom-dark"]?.id).toBe("custom-dark");
  },
  MATRIX_PLANNER_TIMEOUT_MS,
);
