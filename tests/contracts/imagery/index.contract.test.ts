// @orb/contracts/imagery — the image-generation wire vocabulary (D49 item 1). Pins the three schemas the
// db CHECK + Phase-7 leaf + chat caller all DERIVE from (no inline re-spell): the prompt-template MODE
// tuple, the size presets, and the `generatePicture` request (its `n`/`prompt` bounds are the fan-out cap
// and the prompt-length clamp — boundary-tested here since the wire is the trust edge).

import {
  DEFAULT_CAPTION_INSTRUCTIONS,
  DEFAULT_PROMPT_TEMPLATES,
  EXTRACTION_MODES,
  generateImageActionArgsSchema,
  generatePictureRequestSchema,
  MODE_TRIGGERS,
  MULTIMODAL_MODES,
  PROMPT_TEMPLATE_MODES,
  promptTemplateModeSchema,
  SIZE_PRESET_NAMES,
  sizePresetSchema,
} from "@orb/contracts/imagery";
import { expect, test } from "../../support/fixtures.ts";

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

// ── ⑫ the prompt-building CATALOG (as-data) — the shipped-default authored content ──

test("EXTRACTION_MODES + MULTIMODAL_MODES partition the non-free modes, and the default catalogs key on them", () => {
  // The two subsets are the non-free modes, split by extraction-vs-caption; together they cover every mode but `free`.
  expect([...EXTRACTION_MODES, ...MULTIMODAL_MODES].toSorted()).toEqual(PROMPT_TEMPLATE_MODES.filter((m) => m !== "free").toSorted());
  // The default catalogs are keyed EXACTLY by their subset (the Record exhaustiveness the resolver relies on).
  expect(Object.keys(DEFAULT_PROMPT_TEMPLATES).toSorted()).toEqual([...EXTRACTION_MODES].toSorted());
  expect(Object.keys(DEFAULT_CAPTION_INSTRUCTIONS).toSorted()).toEqual([...MULTIMODAL_MODES].toSorted());
});

test("the default catalog pins the load-bearing content (macros in extraction, prefixes, no-macro captions)", () => {
  // Extraction templates carry the {{char}} macro (resolved by the ONE macro engine) + the required opening prefix.
  expect(DEFAULT_PROMPT_TEMPLATES.character).toContain("{{char}}");
  expect(DEFAULT_PROMPT_TEMPLATES.character).toContain("Begin your reply with: full body portrait,");
  expect(DEFAULT_PROMPT_TEMPLATES.background.toLowerCase()).toContain("no people");
  // Caption instructions are macro-free (the image IS the subject).
  expect(DEFAULT_CAPTION_INSTRUCTIONS.character_multimodal).not.toContain("{{");
  expect(DEFAULT_CAPTION_INSTRUCTIONS.face_multimodal).toContain("Begin with: close up facial portrait,");
});

// ── IC-C mints (imagery-design/05 §IC-C) — the /imagine trigger map + the automation action-arm args ──

test("MODE_TRIGGERS maps every trigger word onto a real prompt-template mode", () => {
  expect(MODE_TRIGGERS).toEqual({ you: "character", face: "face", scene: "scenario", background: "background" });
  // Every value is a member of the committed mode tuple (the `satisfies` is compile-pinned; assert at runtime too).
  for (const mode of Object.values(MODE_TRIGGERS)) {
    expect(PROMPT_TEMPLATE_MODES).toContain(mode);
  }
});

test("generateImageActionArgsSchema applies the arm defaults (mode/n/reuse/useAvatarReference/quiet)", () => {
  const parsed = generateImageActionArgsSchema.parse({});
  expect(parsed.mode).toBe("scenario");
  expect(parsed.n).toBe(1);
  expect(parsed.reuse).toBe("prefer");
  expect(parsed.useAvatarReference).toBe(false);
  expect(parsed.quiet).toBe(false);
});

test("generateImageActionArgsSchema clamps n (1..4), the prompt/negative caps, and validates the subject id", () => {
  expect(generateImageActionArgsSchema.safeParse({ n: 0 }).success).toBe(false);
  expect(generateImageActionArgsSchema.safeParse({ n: 5 }).success).toBe(false);
  expect(generateImageActionArgsSchema.safeParse({ prompt: "a".repeat(2001) }).success).toBe(false);
  expect(generateImageActionArgsSchema.safeParse({ negative: "n".repeat(1001) }).success).toBe(false);
  // subjectCharacterId is a strict character TypeID (a chat id is rejected).
  expect(generateImageActionArgsSchema.safeParse({ subjectCharacterId: "chat_abc" }).success).toBe(false);
});
