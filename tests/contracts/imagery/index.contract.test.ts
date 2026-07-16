// @orb/contracts/imagery — the image-generation wire vocabulary (D49 item 1). Pins the three schemas the
// db CHECK + Phase-7 leaf + chat caller all DERIVE from (no inline re-spell): the prompt-template MODE
// tuple, the size presets, and the `generatePicture` request (its `n`/`prompt` bounds are the fan-out cap
// and the prompt-length clamp — boundary-tested here since the wire is the trust edge).

import { generatePictureRequestSchema, PROMPT_TEMPLATE_MODES, promptTemplateModeSchema, SIZE_PRESET_NAMES, sizePresetSchema } from "@orb/contracts/imagery";
import { expect, test } from "../../support/fixtures";

test("PROMPT_TEMPLATE_MODES is the committed template axis and the schema derives from it", () => {
  expect(PROMPT_TEMPLATE_MODES).toEqual(["free", "character", "face", "scenario", "background", "character_multimodal", "face_multimodal"]);
  expect(promptTemplateModeSchema.options).toEqual(PROMPT_TEMPLATE_MODES);
});

test("promptTemplateModeSchema round-trips every mode and rejects non-members", () => {
  for (const mode of PROMPT_TEMPLATE_MODES) {
    expect(promptTemplateModeSchema.parse(mode)).toBe(mode);
  }
  expect(promptTemplateModeSchema.safeParse("freeform").success).toBe(false);
  expect(promptTemplateModeSchema.safeParse("").success).toBe(false);
});

test("SIZE_PRESET_NAMES is [square, portrait, landscape] and sizePresetSchema derives from it", () => {
  expect(SIZE_PRESET_NAMES).toEqual(["square", "portrait", "landscape"]);
  expect(sizePresetSchema.options).toEqual(SIZE_PRESET_NAMES);
  expect(sizePresetSchema.safeParse("wide").success).toBe(false);
});

test("generatePictureRequestSchema parses the Phase-5 free-mode wire (mode required, rest optional)", () => {
  const parsed = generatePictureRequestSchema.parse({ mode: "free", prompt: "a red door" });
  expect(parsed.mode).toBe("free");
  expect(parsed.prompt).toBe("a red door");
  // The bare mode (no prompt/n/size) is valid — the caller may refine the prompt server-side.
  expect(generatePictureRequestSchema.safeParse({ mode: "character" }).success).toBe(true);
  // A missing mode (the one required field) is rejected.
  expect(generatePictureRequestSchema.safeParse({ prompt: "x" }).success).toBe(false);
});

test("generatePictureRequestSchema enforces the n fan-out cap (1..4) and the prompt-length clamp", () => {
  expect(generatePictureRequestSchema.safeParse({ mode: "free", n: 1 }).success).toBe(true);
  expect(generatePictureRequestSchema.safeParse({ mode: "free", n: 4 }).success).toBe(true);
  expect(generatePictureRequestSchema.safeParse({ mode: "free", n: 0 }).success).toBe(false);
  expect(generatePictureRequestSchema.safeParse({ mode: "free", n: 5 }).success).toBe(false);
  expect(generatePictureRequestSchema.safeParse({ mode: "free", n: 2.5 }).success).toBe(false);
  // The 2000-char prompt ceiling — at cap parses, one over is rejected.
  expect(generatePictureRequestSchema.safeParse({ mode: "free", prompt: "a".repeat(2000) }).success).toBe(true);
  expect(generatePictureRequestSchema.safeParse({ mode: "free", prompt: "a".repeat(2001) }).success).toBe(false);
});
