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
import type { ProseSlotDef, ProseSlotId } from "#prose-slot";

/** The committed prompt-template modes. `free` = the user's prompt verbatim — the
 *  only mode the Phase-5 chat caller drives; the rest are the Phase-7 extraction/caption modes. A new mode
 *  fails the templates `Record`'s `tsc` (imagery-design/02 §5) — the exhaustiveness lever. */
export const PROMPT_TEMPLATE_MODES = ["free", "character", "face", "scenario", "background", "character_multimodal", "face_multimodal"] as const;
export const promptTemplateModeSchema = z.enum(PROMPT_TEMPLATE_MODES);
export type PromptTemplateMode = z.infer<typeof promptTemplateModeSchema>;

// ── The prompt-building CATALOG (Phase B ⑫) — the SHIPPED-DEFAULT authored content, as-data ──────────
// The image-prompt-mode instructions were hardcoded in the server leaf (`domain/imagery/substrate/templates`);
// homed HERE as the catalog (the ONE imagery-vocabulary home, grows additively) so a per-user
// `UserSettings.imagery` override composes over them (unset ⇒ byte-identical to the shipped default). The
// server substrate DERIVES `PROMPT_TEMPLATES`/`CAPTION_INSTRUCTIONS` from these (never re-spelled — the
// `no-inline-union-redecl` discipline the modes tuple follows). The `{{char}}`/`{{user}}` macros resolve
// through the ONE `@orb/kit/macro` engine at extraction time (a user override rides the same engine).

/** The text-EXTRACTION modes (the quiet-shaper reads recent canon under these). `free` = the user's verbatim
 *  prompt (no template); the multimodal modes caption an avatar instead. */
export const EXTRACTION_MODES = ["character", "face", "scenario", "background"] as const satisfies readonly PromptTemplateMode[];
export type ExtractionMode = (typeof EXTRACTION_MODES)[number];

/** The MULTIMODAL caption modes (the ONE vision op captions the subject's avatar — the image IS the subject,
 *  so these carry no `{{macros}}`). */
export const MULTIMODAL_MODES = ["character_multimodal", "face_multimodal"] as const satisfies readonly PromptTemplateMode[];
export type MultimodalCaptionMode = (typeof MULTIMODAL_MODES)[number];

/** The shipped-default extraction instructions (imagery-design/02 §5). Each instructs the LLM to open with the
 *  mode's REQUIRED composition prefix (the size defaults assume it; `ensurePrefix` re-asserts it as a drift
 *  belt). Modernized from ST's promptTemplates: the jailbreak preamble is an explicit "Pause the roleplay". */
export const DEFAULT_PROMPT_TEMPLATES: Record<ExtractionMode, string> = {
  character:
    "Pause the roleplay. Describe {{char}}'s complete physical appearance in the current moment " +
    "as a single comma-delimited list of concrete visual keywords for an image-generation model: " +
    "body type, hair, eyes, skin, facial features, clothing and its state, accessories, pose, " +
    "expression. Only visual terms — no names, no story, no prose sentences, no quotation marks. " +
    "Begin your reply with: full body portrait,",
  face:
    "Pause the roleplay. Describe {{char}}'s face in the current moment as a single " +
    "comma-delimited list of concrete visual keywords for an image-generation model: facial " +
    "features, expression, eye color and shape, hair framing the face, skin, any marks or " +
    "accessories on the head. Only visual terms — no names, no prose, no quotation marks. " +
    "Begin your reply with: close up facial portrait,",
  scenario:
    "Pause the roleplay. Summarize the current scene of the story as a single comma-delimited " +
    "list of concrete visual keywords for an image-generation model: the characters present and " +
    "their visible actions, the setting, time of day, mood, lighting, notable objects. Only " +
    "visual terms — no names beyond simple descriptors, no prose, no quotation marks. " +
    "Begin your reply with: scene,",
  background:
    "Pause the roleplay. Describe the current location of the story as a single comma-delimited " +
    "list of concrete visual keywords for an image-generation model: the place, architecture or " +
    "natural features, time of day, weather, lighting, atmosphere. Describe ONLY the environment " +
    "— no people, no characters, no figures. Begin your reply with: background,",
};

/** The shipped-default multimodal vision-caption instructions (imagery-design/02 §6). No macros — the image IS
 *  the subject. */
// biome-ignore-start lint/style/useNamingConvention: the keys ARE the snake_case PROMPT_TEMPLATE_MODES literals (the mode vocabulary); a rename would fork the wire.
export const DEFAULT_CAPTION_INSTRUCTIONS: Record<MultimodalCaptionMode, string> = {
  character_multimodal:
    "Describe the person in this image as a single comma-delimited list of concrete visual " +
    "keywords for an image-generation model: body type, hair, eyes, skin, clothing, accessories, " +
    "pose. Only visual terms, no prose. Begin with: full body portrait,",
  face_multimodal:
    "Describe the face of the person in this image as a single comma-delimited list of concrete " +
    "visual keywords for an image-generation model: facial features, expression, eyes, hair, " +
    "skin, head accessories. Only visual terms, no prose. Begin with: close up facial portrait,",
};
// biome-ignore-end lint/style/useNamingConvention: see start marker

// ── The PROSE-1 slot table (census rows 82-87) — adapted IN PLACE ────────────────────────────────────
// The catalog above already IS the shipped-default home; these rows give it the registry metadata every
// prose slot carries (version + macro mode + required tokens + editor copy). The override STORAGE is
// unchanged — still `UserSettings.imagery.templates/.captions` (PROSE-1 §4.6: adapt, never duplicate) —
// and `resolveImageryTemplate`/`resolveImageryCaption` funnel through `resolveProse` so precedence and
// staleness come from ONE place.
//
// `requiredTokens` mirrors `REQUIRED_PREFIXES` (server `imagery/substrate/templates.ts`): a host who drops
// the "Begin your reply with:" prefix from an override is warned, because `ensurePrefix` will re-assert it
// and the resulting prompt will read twice. The prefix belt itself stays code — it is a defense, not a voice.
// The slot SHAPE comes from `#prose-slot`, never `#prose`: `#prose` imports THIS module at runtime to compose
// `PROSE_SLOTS`, so importing it here would close a `no-circular` cycle.

export const IMAGERY_PROSE_SLOTS = {
  "imagery.template.character": {
    id: "imagery.template.character",
    home: "user",
    version: 1,
    text: DEFAULT_PROMPT_TEMPLATES.character,
    macros: "full",
    requiredMacros: ["{{char}}"],
    requiredTokens: ["full body portrait,"],
    title: "Full-body portrait prompt",
    fires: "The quiet shaper, when an image is requested in `character` mode.",
  },
  "imagery.template.face": {
    id: "imagery.template.face",
    home: "user",
    version: 1,
    text: DEFAULT_PROMPT_TEMPLATES.face,
    macros: "full",
    requiredMacros: ["{{char}}"],
    requiredTokens: ["close up facial portrait,"],
    title: "Face portrait prompt",
    fires: "The quiet shaper, when an image is requested in `face` mode.",
  },
  "imagery.template.scenario": {
    id: "imagery.template.scenario",
    home: "user",
    version: 1,
    text: DEFAULT_PROMPT_TEMPLATES.scenario,
    macros: "full",
    requiredMacros: [],
    requiredTokens: ["scene,"],
    title: "Scene prompt",
    fires: "The quiet shaper, when an image is requested in `scenario` mode.",
  },
  "imagery.template.background": {
    id: "imagery.template.background",
    home: "user",
    version: 1,
    text: DEFAULT_PROMPT_TEMPLATES.background,
    macros: "full",
    requiredMacros: [],
    requiredTokens: ["background,"],
    title: "Background prompt",
    fires: "The quiet shaper, when an image is requested in `background` mode.",
  },
  "imagery.caption.characterMultimodal": {
    id: "imagery.caption.characterMultimodal",
    home: "user",
    version: 1,
    text: DEFAULT_CAPTION_INSTRUCTIONS.character_multimodal,
    macros: "none",
    requiredMacros: [],
    requiredTokens: ["full body portrait,"],
    title: "Full-body caption instruction",
    fires: "The vision op, captioning a subject's avatar in `character_multimodal` mode.",
  },
  "imagery.caption.faceMultimodal": {
    id: "imagery.caption.faceMultimodal",
    home: "user",
    version: 1,
    text: DEFAULT_CAPTION_INSTRUCTIONS.face_multimodal,
    macros: "none",
    requiredMacros: [],
    requiredTokens: ["close up facial portrait,"],
    title: "Face caption instruction",
    fires: "The vision op, captioning a subject's avatar in `face_multimodal` mode.",
  },
  // Census row 88 (PROSE-1 S1). the negative-prompt lists adapted from Marinara Engine, deduped to the generic defect-suppression
  // core — homed here with its template siblings (it was a server-substrate const). The user's `negative`
  // request field still APPENDS to whatever this resolves to (never replaces): the two are different things —
  // this is the standing house floor, that is the per-generation addition.
  "imagery.negative.base": {
    id: "imagery.negative.base",
    home: "user",
    version: 1,
    text:
      "text, letters, captions, subtitles, UI, watermark, logo, signature, speech bubble, " +
      "split screen, panel, collage, grid, duplicated face, extra head, extra person, " +
      "bad anatomy, low quality",
    macros: "none",
    requiredMacros: [],
    requiredTokens: [],
    title: "Negative-prompt base",
    fires: "Every image generation — the standing defect-suppression list the request's negative opens with.",
  },
} as const satisfies Partial<Record<ProseSlotId, ProseSlotDef>>;

/** The negative-prompt base slot — the ONE id both the resolver and the editor read. */
export const IMAGERY_NEGATIVE_SLOT_ID: ProseSlotId = "imagery.negative.base";

/** Slot id per extraction mode — the ONE map both the resolver and the editor read (never a re-spelled id). */
export const IMAGERY_TEMPLATE_SLOT_IDS: Record<ExtractionMode, ProseSlotId> = {
  character: "imagery.template.character",
  face: "imagery.template.face",
  scenario: "imagery.template.scenario",
  background: "imagery.template.background",
};

/** Slot id per multimodal caption mode. Computed-key form (the `DEFAULT_MARKER_TEMPLATES` precedent) — the
 *  keys ARE the snake_case `PROMPT_TEMPLATE_MODES` literals, and a rename would fork the wire vocabulary. */
export const IMAGERY_CAPTION_SLOT_IDS: Record<MultimodalCaptionMode, ProseSlotId> = {
  ["character_multimodal"]: "imagery.caption.characterMultimodal",
  ["face_multimodal"]: "imagery.caption.faceMultimodal",
};

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
/** @public type twin of `generatePictureRequestSchema`, the live `generateImage` tRPC input. */
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
