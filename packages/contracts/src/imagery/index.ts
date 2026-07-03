// @orb/contracts/imagery — the image-generation wire vocabulary (D49 item 1). The ONE home for the prompt
// template MODES (the db `imagery_generations` CHECK + the Phase-7 leaf's templates both DERIVE this tuple —
// `no-inline-union-redecl`), the size presets, and the chat-facing `generatePicture` request. The Phase-7
// leaf (extract/caption/reuse/edit fields) + the D46 `/imagine` action args grow this file ADDITIVELY.

import { z } from "zod";

/** The committed prompt-template modes. `free` = the user's prompt verbatim — the
 *  only mode the Phase-5 chat caller drives; the rest are the Phase-7 extraction/caption modes. A new mode
 *  fails the templates `Record`'s `tsc` (imagery-design/02 §5) — the exhaustiveness lever. */
export const PROMPT_TEMPLATE_MODES = [
  "free",
  "character",
  "face",
  "scenario",
  "background",
  "character_multimodal",
  "face_multimodal",
] as const;
export const promptTemplateModeSchema = z.enum(PROMPT_TEMPLATE_MODES);
export type PromptTemplateMode = z.infer<typeof promptTemplateModeSchema>;

/** The semantic size presets (imagery-design/02 §6 — gpt-image-1's published set; every hosted model snaps
 *  arbitrary dimensions to its own buckets anyway, so optimizing for the strictest wire wins). The concrete
 *  WxH mapping lives in the leaf's `substrate/size.ts` (Phase 7). */
export const SIZE_PRESET_NAMES = ["square", "portrait", "landscape"] as const;
export const sizePresetSchema = z.enum(SIZE_PRESET_NAMES);
export type SizePresetName = z.infer<typeof sizePresetSchema>;

// Request numeric bounds (named — `noMagicNumbers`). `n` clamp mirrors the leaf's per-call fan-out cap
// (imagery-design/02 §1 — one provider call fans out `n`, never a per-image loop).
const MAX_PROMPT_CHARS = 2000;
const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 4;

/** The chat-client wire for `chat.generateImage` → `imagery.generatePicture`.
 *  Phase-5 drives `mode:"free"` with a required `prompt` (the caller refines it); the Phase-7 fields
 *  (`negative`/`subjectCharacterId`/`useAvatarReference`/`reuse`) are additive optionals. */
export const generatePictureRequestSchema = z.object({
  mode: promptTemplateModeSchema,
  prompt: z.string().max(MAX_PROMPT_CHARS).optional(),
  n: z.number().int().min(MIN_IMAGE_COUNT).max(MAX_IMAGE_COUNT).optional(),
  size: sizePresetSchema.optional(),
});
export type GeneratePictureRequest = z.infer<typeof generatePictureRequestSchema>;
