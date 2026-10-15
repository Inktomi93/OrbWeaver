import { ADJUSTED_KNOBS, CHAT_WARNING_CODES, PROVIDER_ADJUSTMENT_KINDS } from "@orb/contracts/chat";
import { resolvedWarningSchema, WARNING_CODES } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("cold inference and chat imports initialize shared warning vocabulary without merging independent axes", () => {
  for (const code of WARNING_CODES) {
    expect(resolvedWarningSchema.parse({ code, message: "operator context" })).toEqual({ code, message: "operator context" });
  }
  for (const knob of ADJUSTED_KNOBS) {
    expect(resolvedWarningSchema.parse({ code: "sampling_knob_dropped", message: "operator context", knob }).knob).toBe(knob);
  }
  expect(resolvedWarningSchema.safeParse({ code: "settings_adjusted", message: "not a resolver code" }).success).toBe(false);
  expect(CHAT_WARNING_CODES).toContain("settings_adjusted");
  expect(PROVIDER_ADJUSTMENT_KINDS).toContain("sampling_knob_dropped");
  expect(WARNING_CODES).not.toBe(PROVIDER_ADJUSTMENT_KINDS);
  expect(resolvedWarningSchema.safeParse({ code: "sampling_knob_dropped", message: "operator context", knob: "privateKnob" }).success).toBe(false);
  expect(resolvedWarningSchema.safeParse({ code: "reasoning_mandatory_clamp", message: "operator context", appliedEffort: "none" }).success).toBe(false);
  expect(resolvedWarningSchema.safeParse({ code: "cache_control_adjusted", message: "operator context", privateInput: true }).success).toBe(false);
});
