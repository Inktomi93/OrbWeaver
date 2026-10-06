import { PROMPT_TEMPLATE_MODES, promptTemplateModeSchema } from "@orb/contracts/imagery";
import { expect, test } from "../../support/fixtures.ts";

test("PROMPT_TEMPLATE_MODES is the committed template axis and the schema derives from it", () => {
  expect(PROMPT_TEMPLATE_MODES).toEqual(["free", "character", "face", "scenario", "background", "character_multimodal", "face_multimodal"]);
  expect(promptTemplateModeSchema.options).toEqual(PROMPT_TEMPLATE_MODES);
});

test("promptTemplateModeSchema round-trips every mode and rejects non-members", () => {
  for (const mode of PROMPT_TEMPLATE_MODES) {
    expect(promptTemplateModeSchema.parse(JSON.parse(JSON.stringify(mode)))).toBe(mode);
  }
  expect(promptTemplateModeSchema.safeParse("freeform").success).toBe(false);
  expect(promptTemplateModeSchema.safeParse("").success).toBe(false);
});
