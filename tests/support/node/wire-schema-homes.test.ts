import "./composed-real.ts";
import { resolvedWarningSchema as canonicalResolvedWarningSchema, WARNING_CODES as canonicalWarningCodes } from "@orb/contracts/inference";
import {
  EFFECTIVE_KNOBS as canonicalEffectiveKnobs,
  effectivePresetSchema as canonicalEffectivePresetSchema,
  EFFECTIVE_PROVENANCES as canonicalEffectiveProvenances,
  presetDetailSchema as canonicalPresetDetailSchema,
  presetSummarySchema as canonicalPresetSummarySchema,
  presetUsageViewSchema as canonicalPresetUsageViewSchema,
} from "@orb/contracts/preset";
import { resolvedWarningSchema, WARNING_CODES } from "@orb/inference";
import {
  EFFECTIVE_KNOBS,
  EFFECTIVE_PROVENANCES,
  effectivePresetSchema,
  presetDetailSchema,
  presetSummarySchema,
  presetUsageViewSchema,
} from "@orb/server/domain/preset";
import { expect, test } from "./fixtures.ts";

test("public compatibility facades retain the canonical wire schema objects through native graph initialization", () => {
  expect(presetSummarySchema).toBe(canonicalPresetSummarySchema);
  expect(presetDetailSchema).toBe(canonicalPresetDetailSchema);
  expect(presetUsageViewSchema).toBe(canonicalPresetUsageViewSchema);
  expect(effectivePresetSchema).toBe(canonicalEffectivePresetSchema);
  expect(EFFECTIVE_KNOBS).toBe(canonicalEffectiveKnobs);
  expect(EFFECTIVE_PROVENANCES).toBe(canonicalEffectiveProvenances);
  expect(resolvedWarningSchema).toBe(canonicalResolvedWarningSchema);
  expect(WARNING_CODES).toBe(canonicalWarningCodes);
});
