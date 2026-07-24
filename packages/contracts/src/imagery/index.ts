// @orb/contracts/imagery — the image-generation wire vocabulary (D49 item 1). The ONE home for the prompt
// template MODES (the db `imagery_generations` CHECK + the Phase-7 leaf's templates both DERIVE this tuple —
// `no-inline-union-redecl`), the size presets, and the chat-facing `generatePicture` request. The Phase-7
// leaf (extract/caption/reuse/edit fields) + the D46 `/imagine` action args grow this file ADDITIVELY.
//
// IC-C (imagery-design/05 §IC-C): `MODE_TRIGGERS` + `generateImageActionArgsSchema` are minted HERE and
// imported DOWN by `@orb/contracts/automation`'s `generate_image` action arm (never re-spelled there —
// `no-inline-union-redecl`); they land in the SAME commit as their first consumer (automation A4).

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** The committed prompt-template modes. `free` = the user's prompt verbatim — the
 *  only mode the Phase-5 chat caller drives; the rest are the Phase-7 extraction/caption modes. A new mode
 *  fails the templates `Record`'s `tsc` (imagery-design/02 §5) — the exhaustiveness lever. */
export const PROMPT_TEMPLATE_MODES = ["free", "character", "face", "scenario", "background", "character_multimodal", "face_multimodal"] as const;
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

// ── IC-C mints (imagery-design/05 §IC-C) ───────────────────────────────────────────────────────────
// The `/imagine` trigger→mode map + the automation `generate_image` action-arm args. Both land WITH their
// first consumer (automation A4) and are imported down — the /imagine client parse + the automation union
// read ONE home, never a re-spelled stand-in (`no-inline-union-redecl`).

/** Trigger word → mode, for the `/imagine` surface (client autocomplete AND the automation arm parse read
 *  ONE map — engine-vs-data: helpers are substrate, the DATA is contracts). `you`→character card,
 *  `face`→a portrait, `scene`→the current scenario, `background`→a backdrop. */
export const MODE_TRIGGERS = {
  you: "character",
  face: "face",
  scene: "scenario",
  background: "background",
} as const satisfies Record<string, PromptTemplateMode>;

// The negative-prompt cap for the action arm (named — `noMagicNumbers`). Shorter than the prompt cap: a
// negative is a keyword list, not a scene description.
const MAX_NEGATIVE_CHARS = 1000;
const DEFAULT_ACTION_MODE = "scenario" satisfies PromptTemplateMode;
const DEFAULT_IMAGE_COUNT = 1;

/** The automation Tier-1 `generate_image` action-arm args (automation-design/03 §1.7) — lives HERE so the
 *  automation contract IMPORTS it into its action union, never re-spells it (`no-inline-union-redecl`). The
 *  args map 1:1 onto `GeneratePictureParams`; `quiet` is interpreted by the CALLER (post vs fire-log
 *  return — automation-design/03 §1.7 / 04 §2), not by imagery. */
export const generateImageActionArgsSchema = z.object({
  mode: promptTemplateModeSchema.default(DEFAULT_ACTION_MODE),
  prompt: z.string().max(MAX_PROMPT_CHARS).optional(),
  negative: z.string().max(MAX_NEGATIVE_CHARS).optional(),
  n: z.number().int().min(MIN_IMAGE_COUNT).max(MAX_IMAGE_COUNT).default(DEFAULT_IMAGE_COUNT),
  size: sizePresetSchema.optional(),
  subjectCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
  useAvatarReference: z.boolean().default(false),
  reuse: z.enum(["prefer", "never"]).default("prefer"),
  quiet: z.boolean().default(false),
});
export type GenerateImageActionArgs = z.infer<typeof generateImageActionArgsSchema>;
