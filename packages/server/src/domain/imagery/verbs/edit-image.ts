// verb: editImage — explicit edit of an existing owned image (doc 02 §4). Order: resolve source bytes
// (owned asset via the owner-gated `readAsset`, or direct upload bytes) → resolve role + capability →
// CAPABILITY GATE: a model without `input.imageEdit` THROWS `ImageEditUnsupportedError` (the asymmetric
// posture — an explicit edit silently degraded to an unrelated text→image would violate least surprise,
// doc 01 §3.4; contrast B3's drop-with-warning) → build the `edit:{image,mask?}` request (`prompt` is the
// instruction VERBATIM — no template, no extraction) → the shared generation tail (`edited:true`,
// `mode:"free"`, never reuse-gated — edits are moment art, doc 03 §4.4). Never posts (the caller's job).

import type { Principal } from "@orb/contracts/identity";
import type { AssetId } from "@orb/kit/ids";
import { ImageEditUnsupportedError, ImageryNotConfiguredError } from "../contract/errors";
import type { EditImageParams, EditImageSource } from "../contract/params";
import type { GeneratedPicture } from "../contract/results";
import type { ImageryContext, ImageryService, ResolvedGenerateImage } from "../contract/service";
import { runGeneration, sumCost } from "../substrate/generate-core";
import { SIZE_PRESETS } from "../substrate/size";

/** Default fan-out when the caller omits `n` (the wire clamps to 1..4). */
const DEFAULT_IMAGE_COUNT = 1;

/** Resolve the edit's init-image bytes: an owned `assetId` reads through the owner-gated `readAsset` port
 *  (throws assets' not-found on non-owned — imagery does not re-gate); an upload's bytes are used directly. */
async function resolveSourceBytes(ctx: ImageryContext, caller: Principal, source: EditImageSource): Promise<Uint8Array> {
  if ("assetId" in source) {
    const assetId: AssetId = source.assetId;
    const { bytes } = await ctx.readAsset(caller, assetId);
    return bytes;
  }
  return source.bytes;
}

/** Resolve the generateImage role + capability; a resolve failure wraps into `ImageryNotConfiguredError`. */
async function resolveOrThrow(ctx: ImageryContext, caller: Principal): Promise<ResolvedGenerateImage> {
  try {
    return await ctx.resolveGenerateImage(caller);
  } catch (err) {
    const error = new ImageryNotConfiguredError("imagery: no generateImage role is configured for this caller");
    error.cause = err;
    throw error;
  }
}

export function createEditImage(ctx: ImageryContext): ImageryService["editImage"] {
  return async (p: EditImageParams): Promise<GeneratedPicture> => {
    const imageBytes = await resolveSourceBytes(ctx, p.caller, p.source);
    const resolution = await resolveOrThrow(ctx, p.caller);
    // The capability gate — the asymmetric posture: an explicit edit on a non-edit model THROWS.
    if (resolution.capability.input?.imageEdit !== true) {
      throw new ImageEditUnsupportedError(`imagery: model "${resolution.connection.model}" cannot edit images (input.imageEdit is not set)`);
    }

    const outcome = await runGeneration(
      ctx,
      {
        credential: resolution.connection.credential,
        model: resolution.connection.model,
        owner: p.caller.userId,
        prompt: p.instruction,
        n: p.n ?? DEFAULT_IMAGE_COUNT,
        // Omit `size` by default — let the backend preserve the source dimensions (forcing a preset crops/distorts).
        ...(p.size !== undefined ? { size: SIZE_PRESETS[p.size] } : {}),
        edit: { image: imageBytes, ...(p.mask !== undefined ? { mask: p.mask.bytes } : {}) },
        // Forward the resolved capability the domain gate read so the runner's belt sees the SAME edit-capable
        // model and lets the edit through (the gate above already threw for a non-edit model).
        capability: resolution.capability,
      },
      {
        caller: p.caller,
        chatId: p.chatId ?? null,
        mode: "free",
        subjectCharacterId: null,
        identityHash: null,
        prompt: p.instruction,
        negativePrompt: null,
        edited: true,
      },
    );
    return {
      images: outcome.images,
      prompt: p.instruction,
      promptSource: "user",
      mode: "free",
      model: outcome.model,
      costUsd: sumCost(0, outcome.costUsd),
      reused: false,
      // Any runner edit-strip belt warning that flowed up despite the domain gate (e.g. a dropped mask on a
      // wire with no inpaint channel — doc 03 §2.3).
      warnings: outcome.warnings,
    };
  };
}
