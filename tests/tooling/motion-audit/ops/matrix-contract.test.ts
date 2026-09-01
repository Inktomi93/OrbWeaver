import { appearanceMatrixContract } from "../../../../packages/client/src/lib/appearance-carrier-manifest.ts";
import { motionMatrixVariant, planMotionAppearanceMatrix } from "../../../../tooling/src/motion-audit/ops/matrix-contract.ts";
import { parseMotionArgs } from "../../../../tooling/src/motion-audit/ops/parse.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SELECTOR = '[data-slot="collapsible-trigger"]';

test("derives the rated six-cell motion matrix from the live app arm and the requested interaction", () => {
  const matrix = planMotionAppearanceMatrix(appearanceMatrixContract(), SELECTOR);
  expect(matrix.plan.cells).toHaveLength(6);
  expect(matrix.plan.receipt.uncoveredPairs).toEqual([]);
  expect(new Set(matrix.plan.receipt.cellIds).size).toBe(matrix.plan.cells.length);

  const variants = matrix.plan.cells.map((cell, index) => motionMatrixVariant(matrix, cell, index));
  expect(new Set(variants.map((variant) => variant.selector))).toEqual(new Set([null, SELECTOR]));
  expect(new Set(variants.map((variant) => variant.appReducedMotion))).toEqual(new Set([false, true]));
  expect(new Set(variants.map((variant) => variant.osReducedMotion))).toEqual(new Set([false, true]));
  expect(new Set(variants.map((variant) => variant.device))).toEqual(new Set([null, "iPhone 14 Pro Max"]));
  expect(matrix.staticExpected).toEqual({
    candidateId: variants.find(
      (variant) => variant.selector === null && variant.appReducedMotion && variant.osReducedMotion && variant.device === "iPhone 14 Pro Max",
    )?.id,
    controlId: variants.find(
      (variant) => variant.selector === SELECTOR && !variant.appReducedMotion && !variant.osReducedMotion && variant.device === "iPhone 14 Pro Max",
    )?.id,
  });
});

test("refuses a matrix without a real measured interaction", () => {
  expect(() => planMotionAppearanceMatrix(appearanceMatrixContract(), null)).toThrow("INSTRUMENT ERROR: motion matrix requires --selector");
});

test("--matrix requires the existing selector contract and owns its three environment axes", () => {
  expect(parseMotionArgs(["/", "--matrix"]).errors).toContain("--matrix requires --selector so the entry and interaction scenarios are both executable");
  expect(parseMotionArgs(["/", "--matrix", "--selector", SELECTOR]).errors).toEqual([]);
  expect(parseMotionArgs(["/", "--matrix", "--selector", SELECTOR, "--mobile", "--full-motion"]).errors).toContain(
    "--matrix owns application-motion/OS-motion/device axes; drop: --mobile, --full-motion",
  );
});
