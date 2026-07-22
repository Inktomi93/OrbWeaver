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
import type { ComfyuiRoleAvailability } from "../connection";

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

// Diffusion-knob bounds (MA-8/D96). These ride the wire as OPTIONALS and thread through to the provider
// runner; a source whose `ModelCapability.imageGen` lacks the knob ignores it with honesty (never a silent
// drop — the panel only offers a knob the capability advertises). Only the local ComfyUI source honors them.
const MIN_STEPS = 1;
const MAX_STEPS = 150;
const MIN_CFG = 0;
const MAX_CFG = 30;
const MAX_SAMPLER_CHARS = 64;
const MIN_SEED = 0;
const MAX_SEED = 4_294_967_295;

/** The curated-role QUALITY TIER (comfyui-control §C8 / §4.3): the per-call knob that unlocks the family's
 *  max-quality `advanced` bundle (face/eyes detailers, hires, ultimate-upscale, detail-daemon). `standard` is
 *  the guide-exact default surface; `high` merges the advanced bundle (precedence: per-call, advanced, role, family).
 *  Honored ONLY by a curated ComfyUI role whose `imageGen.quality` capability advertises it — hosted/raw arms
 *  ignore it (capability truth). A wire enum so a new tier fails `tsc` at every consumer. */
export const IMAGE_QUALITY_TIERS = ["standard", "high"] as const;
export const imageQualityTierSchema = z.enum(IMAGE_QUALITY_TIERS);
export type ImageQualityTier = z.infer<typeof imageQualityTierSchema>;

/** The optional diffusion knobs a local image engine (ComfyUI) honors — steps/cfg/sampler/scheduler/seed +
 *  the curated `quality` tier (MA-8/D96 · comfyui-control §C8). Threaded from the wire through
 *  `GeneratePictureParams` to the provider runner; the runner fills its own defaults for any absent knob.
 *  Hosted image sources ignore them (capability truth). */
export const imageDiffusionParamsSchema = z.object({
  steps: z.number().int().min(MIN_STEPS).max(MAX_STEPS).optional(),
  cfg: z.number().min(MIN_CFG).max(MAX_CFG).optional(),
  sampler: z.string().min(1).max(MAX_SAMPLER_CHARS).optional(),
  scheduler: z.string().min(1).max(MAX_SAMPLER_CHARS).optional(),
  seed: z.number().int().min(MIN_SEED).max(MAX_SEED).optional(),
  /** The curated-role quality tier (§C8) — `high` unlocks the family advanced bundle; absent ⇒ `standard`. */
  quality: imageQualityTierSchema.optional(),
});
export type ImageDiffusionParams = z.infer<typeof imageDiffusionParamsSchema>;

// The curated-pose id cap (named — `noMagicNumbers`). A `<category>/<name>` selector from the frozen
// generated index; the domain rejects any unknown/escaping id (`resolveCuratedPose` → path confinement).
const MAX_POSE_ID_CHARS = 200;

/** An OPTIONAL ControlNet pose selection (comfyui-control §4.12, C6d) — the advanced-knob pose lever the
 *  picker sets. Either a CURATED skeleton (`poseRef` — a `<category>/<name>` selector into the shipped library,
 *  NOT a branded entity id; the domain resolves it to the static skeleton's BYTES) or a BYO pose asset
 *  (`poseAssetId` — the caller's own `pose`-kind CAS asset, byte
 *  read by owner-gated `readAsset`). Resolved server-side into the runner's `edit.poseControl` control-map
 *  channel; honored ONLY by a local ComfyUI curated role whose family advertises the `pose` lever (§4.12.4) —
 *  every hosted/raw-checkpoint arm has no ControlNet and drops it with an honest `image_pose_dropped` warning
 *  (never a silent no-op). The picker's PRESENCE is capability-gated on the same `levers.pose` signal. */
export const poseSelectionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("curated"), poseRef: z.string().min(1).max(MAX_POSE_ID_CHARS) }),
  z.object({ kind: z.literal("byo"), poseAssetId: typeIdSchema(ID_PREFIX.asset) }),
]);
export type PoseSelection = z.infer<typeof poseSelectionSchema>;

/** The pose picker's capability gate (comfyui-control §4.12.4, C6d) — the client derives this from the
 *  configured generateImage slot + the live ComfyUI probe (the derivation + its user-facing refusal COPY live
 *  client-side; only the SHAPE is homed here, beside `PoseSelection`). Pose attaches ONLY for a local ComfyUI
 *  CURATED role whose family+nodes advertise the `pose` lever: `loading` while the probe is in flight,
 *  `unavailable` carries the honest refusal REASON (never a dead affordance), `available` carries the grounded
 *  role. A discriminated union (§5.5) — the status arms never collapse into optional fields. */
export type PoseCapability =
  | { readonly status: "loading" }
  | { readonly status: "available"; readonly role: ComfyuiRoleAvailability }
  | { readonly status: "unavailable"; readonly reason: string };

/** The quality-tier toggle's capability gate (comfyui-control §C8 / §8-ruling-4) — the client derives this from
 *  the configured generateImage slot + the live probe (derivation client-side; only the SHAPE homes here, beside
 *  {@link PoseCapability}). Quality attaches ONLY for a local ComfyUI CURATED role whose family advertises a
 *  max-quality `advanced` bundle (`imageGen.quality`): `loading` while probing, `available` carries the role
 *  label for the hint, `unavailable` renders nothing (a family without an advanced bundle offers no toggle — no
 *  refusal COPY, unlike pose). A discriminated union (§5.5) — the status arms never collapse into optional fields. */
export type QualityCapability =
  | { readonly status: "loading" }
  | { readonly status: "available"; readonly roleLabel: string }
  | { readonly status: "unavailable" };

/** The chat-client wire for `chat.generateImage` → `imagery.generatePicture`.
 *  Phase-5 drives `mode:"free"` with a required `prompt` (the caller refines it); the Phase-7 fields
 *  (`negative`/`subjectCharacterId`/`useAvatarReference`/`reuse`) are additive optionals. The diffusion
 *  knobs (MA-8) ride under `params`, honored only by a local engine (ComfyUI). */
export const generatePictureRequestSchema = z.object({
  mode: promptTemplateModeSchema,
  prompt: z.string().max(MAX_PROMPT_CHARS).optional(),
  n: z.number().int().min(MIN_IMAGE_COUNT).max(MAX_IMAGE_COUNT).optional(),
  size: sizePresetSchema.optional(),
  params: imageDiffusionParamsSchema.optional(),
  /** The advanced-knob ControlNet pose pick (§4.12, C6d) — resolved server-side to `edit.poseControl`.
   *  Local ComfyUI curated-role only; hosted/raw arms drop it with an honest warning (capability truth). */
  pose: poseSelectionSchema.optional(),
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
