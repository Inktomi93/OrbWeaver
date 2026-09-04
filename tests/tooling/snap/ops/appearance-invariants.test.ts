import { describe } from "vitest";
import type { RuntimeAppearanceHistoricalRow } from "../../../../tooling/src/_shared/appearance-matrix.ts";
import type { AppearanceInvariantReceipt } from "../../../../tooling/src/snap/contract/appearance-invariants.ts";
import { evaluateAppearanceInvariantCell, sameAppearanceReceiptPopulation } from "../../../../tooling/src/snap/ops/appearance-invariants.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const selector = '[data-slot="dialog-popup"]';
const requiredMerge = {
  mechanism: "merge-required",
  selector,
  owner: "packages/ui/src/primitives/dialog/dialog.tsx#DialogPopup",
  conflict: { axis: "tailwind-core", loser: "relative", winner: "relative" },
} as const;
const policy: RuntimeAppearanceHistoricalRow = {
  id: "compact-portal-carried",
  surface: "config-sizing",
  subjects: [{ id: "popup", selector, population: "one", sample: "geometry" }],
  cascade: [{ selector, property: "--spacing-row", sources: ["generated-theme"] }],
  merge: requiredMerge,
  requiredChecks: ["popup-contained"],
  optionalSubjectIds: [],
};

function cleanReceipt(): AppearanceInvariantReceipt {
  return {
    rowId: policy.id,
    accounting: { declared: 1, candidates: 1, reached: 1, sampled: 1, skipped: [], occluded: 0, offViewport: 0 },
    subjects: [
      {
        id: "popup",
        selector,
        matchIndex: 0,
        accounting: { declared: 1, candidates: 1, reached: 1, sampled: 1, skipped: [], occluded: 0, offViewport: 0 },
      },
    ],
    checks: [{ id: "popup-contained", expected: "inside dialog viewport", actual: "inside dialog viewport", passed: true }],
    pixels: [],
    cascade: [{ selector, property: "--spacing-row", matchIndex: 0, expectedValue: "8px", expectedSource: "generated-theme", expectedOverloadedSources: [] }],
    merge: { ...requiredMerge, expectedOutput: "relative max-h-(--available-height)" },
    deadCss: {
      sheets: 3,
      readableSheets: 3,
      rules: 20,
      defined: 10,
      used: 10,
      unreadable: [],
      drain: { requestedGeneration: 2, completedGeneration: 2 },
      dead: [],
      empty: [],
    },
    css: {
      status: "ok",
      repositoryDeclarations: 1,
      error: null,
      merge: {
        status: "ok",
        enabled: true,
        calls: 4,
        conflictCalls: 1,
        deduplicatedConflictCalls: 1,
        receipts: [
          {
            input: [
              { index: 0, className: "relative" },
              { index: 1, className: "relative" },
            ],
            output: "relative max-h-(--available-height)",
            conflicts: [{ axis: "tailwind-core", loser: { index: 0, className: "relative" }, winner: { index: 1, className: "relative" } }],
          },
        ],
      },
      cascade: [
        {
          status: "ok",
          selector,
          property: "--spacing-row",
          matchIndex: 0,
          computedValue: "8px",
          targetId: "node-1",
          computedDefault: false,
          declarations: [
            {
              property: "--spacing-row",
              value: "8px",
              state: "Active",
              important: false,
              inherited: true,
              styleType: "Regular",
              selector: ":root",
              styleSheetId: "sheet-1",
              sourceUrl: "/generated-theme.css",
              source: "generated-theme",
              range: null,
            },
          ],
        },
      ],
    },
  };
}

describe("#953 appearance invariant receipt", () => {
  test("rejects a same-count replacement in the historical receipt population", () => {
    expect(sameAppearanceReceiptPopulation(["R1", "R5", "R5"], ["R1", "R5", "R5"])).toBe(true);
    expect(sameAppearanceReceiptPopulation(["R1", "R5", "R5"], ["R1", "R5", "R6"])).toBe(false);
  });

  test("accepts exact subject, cascade, merge, and CSS population evidence", () => {
    expect(evaluateAppearanceInvariantCell(policy, cleanReceipt())).toMatchObject({
      status: "ok",
      errors: [],
      violations: [],
      mergeRequired: 1,
      mergeDirectCarrier: 0,
    });
  });

  test("fails planted accounting, dead/empty CSS, same-value wrong-source, and unrelated-merge evidence", () => {
    const clean = cleanReceipt();
    const planted: AppearanceInvariantReceipt = {
      ...clean,
      accounting: { ...clean.accounting, candidates: 2 },
      deadCss: { ...clean.deadCss, dead: [{ token: "dead-plant", count: 1 }], empty: ["empty-plant"] },
      css: {
        ...clean.css,
        merge: {
          status: "ok",
          enabled: true,
          calls: 4,
          conflictCalls: 1,
          deduplicatedConflictCalls: 1,
          receipts: [
            {
              input: [
                { index: 0, className: "relative" },
                { index: 1, className: "relative" },
              ],
              output: "unrelated-global-receipt",
              conflicts: [{ axis: "tailwind-core", loser: { index: 0, className: "relative" }, winner: { index: 1, className: "relative" } }],
            },
          ],
        },
        cascade: clean.css.cascade.map((row) =>
          row.status === "ok"
            ? {
                ...row,
                declarations: row.declarations.map((declaration) => ({ ...declaration, source: "owner-custom-css" as const })),
              }
            : row,
        ),
      },
    };
    const result = evaluateAppearanceInvariantCell(policy, planted);
    expect(result.status).toBe("instrument-error");
    expect(result.errors.join("\n")).toContain("does not reconcile");
    expect(result.violations.join("\n")).toContain("dead CSS identities");
    expect(result.violations.join("\n")).toContain("empty CSS identities");
    expect(result.violations.join("\n")).toContain("Active source mismatch");
    expect(result.violations.join("\n")).toContain("configured merge winner missing");
  });

  test("counts direct-carrier N/A without accepting a fabricated merge requirement", () => {
    const directPolicy: RuntimeAppearanceHistoricalRow = {
      ...policy,
      merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector, owner: "owner#direct" },
    };
    const directReceipt: AppearanceInvariantReceipt = {
      ...cleanReceipt(),
      merge: { mechanism: "merge-not-applicable", reason: "direct-carrier", selector, owner: "owner#direct" },
      css: {
        ...cleanReceipt().css,
        merge: {
          status: "instrument-error",
          enabled: true,
          calls: 0,
          conflictCalls: 0,
          deduplicatedConflictCalls: 0,
          receipts: [],
          error: "no configured merge calls",
        },
      },
    };
    expect(evaluateAppearanceInvariantCell(directPolicy, directReceipt)).toMatchObject({
      status: "ok",
      mergeRequired: 0,
      mergeDirectCarrier: 1,
    });
  });

  test("classifies absent merge transport as instrument error instead of throwing", () => {
    const clean = cleanReceipt();
    const result = evaluateAppearanceInvariantCell(policy, {
      ...clean,
      css: { ...clean.css, status: "instrument-error", merge: null, error: "DevTools cascade runtime is not attached" },
    });

    expect(result.status).toBe("instrument-error");
    expect(result.errors.join("\n")).toContain("DevTools cascade runtime is not attached");
    expect(result.errors.join("\n")).toContain("configured merge trace is absent");
  });

  test("requires a real composited pixel sample and rejects same-count counterfeit membership", () => {
    const pixelPolicy: RuntimeAppearanceHistoricalRow = {
      ...policy,
      subjects: [{ id: "popup", selector, population: "one", sample: "pixel" }],
    };
    const clean = cleanReceipt();
    const validPixel = {
      selector,
      status: "ok" as const,
      candidates: 1,
      inViewport: 1,
      sampled: 1,
      matchIndex: 0,
      method: "pixel-sample" as const,
      ratio: 7,
      requiredRatio: 4.5,
      passed: true,
      foreground: { r: 255, g: 255, b: 255 },
      backdrop: { r: 0, g: 0, b: 0 },
      fillChannel: null,
      reason: null,
    };
    expect(evaluateAppearanceInvariantCell(pixelPolicy, { ...clean, pixels: [validPixel] }).status).toBe("ok");

    const counterfeit = evaluateAppearanceInvariantCell(pixelPolicy, {
      ...clean,
      pixels: [{ ...validPixel, selector: '[data-slot="unrelated"]' }],
    });
    expect(counterfeit.status).toBe("instrument-error");
    expect(counterfeit.errors.join("\n")).toContain("does not exactly match");

    const refused = evaluateAppearanceInvariantCell(pixelPolicy, {
      ...clean,
      pixels: [{ ...validPixel, status: "refused", sampled: 0, method: null, ratio: null, requiredRatio: null, passed: null, reason: "occluded" }],
    });
    expect(refused.status).toBe("instrument-error");
    expect(refused.errors.join("\n")).toContain("lacks a composited framebuffer verdict");

    const lowContrast = evaluateAppearanceInvariantCell(pixelPolicy, {
      ...clean,
      pixels: [{ ...validPixel, ratio: 2 }],
    });
    expect(lowContrast.status).toBe("violations");
    expect(lowContrast.violations.join("\n")).toContain("below required");
  });
});
