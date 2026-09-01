import type { AppearancePrepaintEvidence, AppearancePrepaintSample } from "../../../../tooling/src/_shared/appearance-prepaint.ts";
import { evaluateAppearancePrepaint } from "../../../../tooling/src/snap/ops/appearance-prepaint.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const hydrated = { dataTheme: "dark", fontScale: "1.25", reducedMotion: "false" } as const;

function sample(dataTheme: string | null, appReady: string | null = null): AppearancePrepaintSample {
  return { phase: "mutation", dataTheme, fontScale: "1.25", reducedMotion: "false", appReady };
}

function evidence(samples: readonly AppearancePrepaintSample[], overflow = 0): AppearancePrepaintEvidence {
  return { samples, overflow };
}

test("R7 accepts one stable prepaint identity through hydration", () => {
  const result = evaluateAppearancePrepaint(evidence([sample("dark"), sample("dark", "settled")]), hydrated);
  expect(result).toMatchObject({ sampled: 1, continuous: true });

  const defaultFullMotion = { ...sample("dark"), reducedMotion: null };
  expect(evaluateAppearancePrepaint(evidence([defaultFullMotion, { ...defaultFullMotion, appReady: "settled" }]), hydrated).continuous).toBe(true);
  expect(
    evaluateAppearancePrepaint(evidence([defaultFullMotion, { ...defaultFullMotion, appReady: "settled" }]), {
      ...hydrated,
      reducedMotion: "true",
    }).continuous,
  ).toBe(false);
});

test("R7 rejects fake/intermediate identity, late swap, overflow, and an absent sample", () => {
  expect(evaluateAppearancePrepaint(evidence([sample("light"), sample("dark", "settled")]), hydrated).continuous).toBe(false);
  expect(evaluateAppearancePrepaint(evidence([sample("dark"), sample("dark", "settled"), sample("light", "settled")]), hydrated).continuous).toBe(false);
  expect(evaluateAppearancePrepaint(evidence([sample("dark"), sample("dark", "settled")], 1), hydrated).continuous).toBe(false);
  expect(evaluateAppearancePrepaint(evidence([{ ...sample(null), phase: "init" }, sample("dark", "settled")]), hydrated)).toMatchObject({
    sampled: 0,
    continuous: false,
  });
});
