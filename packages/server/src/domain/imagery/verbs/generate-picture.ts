// The generatePicture orchestrator (doc 02 §1): step 2 B2 reuse gate (short-circuit before any provider
// call) → step 3 resolve the prompt (user | captioned | extracted) → step 4 prefix belt → step 5 negative +
// size → step 6 resolve role + capability → step 7 B3 avatar-reference gate (drop-with-warning when the model
// can't edit — doc 03 §3) → steps 8-12 the shared generation tail (`runGeneration`). The store-then-provenance
// GC ordering + materialization live in `generate-core` (one home, shared with `editImage`).

import type { ModelCapability } from "@orb/contracts/connection";
import type { CharacterId } from "@orb/kit/ids";
import { ImageryNotConfiguredError } from "../contract/errors";
import type { GeneratePictureParams } from "../contract/params";
import type { GeneratedPicture, ImageryWarning, ReuseRow } from "../contract/results";
import type { ImageGenerateRequest, ImageryContext, ImageryService, ResolvedGenerateImage, ResolvePrompt } from "../contract/service";
import { findReusableGeneration } from "../persistence/queries";
import { buildBlock, runGeneration, sumCost } from "../substrate/generate-core";
import { identityHashFor } from "../substrate/identity-hash";
import { isMultimodalMode, isPortraitMode } from "../substrate/mode";
import { defaultSizeFor, SIZE_PRESETS } from "../substrate/size";
import { composeNegative, ensurePrefix } from "../substrate/templates";

/** Default fan-out when the caller omits `n` (the wire clamps to 1..4). */
const DEFAULT_IMAGE_COUNT = 1;

/** Resolve the generateImage role + the capability of the SAME model the request will hit (one resolution so
 *  the B3 gate and the request build read the same model). A resolve failure wraps into `ImageryNotConfiguredError`. */
async function resolveGenerateImageOrThrow(ctx: ImageryContext, caller: GeneratePictureParams["caller"]): Promise<ResolvedGenerateImage> {
  try {
    return await ctx.resolveGenerateImage(caller);
  } catch (err) {
    const error = new ImageryNotConfiguredError("imagery: no generateImage role is configured for this caller");
    error.cause = err;
    throw error;
  }
}

/** The B3 gate's resolved reference: the avatar bytes routed onto the plain img2img INIT channel (`image`). */
interface AvatarReference {
  readonly references?: readonly Uint8Array[];
  readonly image?: Uint8Array;
}

/** Step 7 — B3 avatar-reference gate (doc 03 §3): condition a portrait generation on the subject's avatar for
 *  identity consistency. Applies only to a subject (portrait) mode carrying `useAvatarReference`; absent avatar
 *  ⇒ skip silently; a model without `input.imageEdit` ⇒ drop-with-warning (the asymmetric posture — never
 *  throws, unlike `editImage`). The avatar rides the img2img INIT channel (`image`). */
async function avatarReferenceGate(
  ctx: ImageryContext,
  p: GeneratePictureParams,
  resolution: { readonly model: string; readonly capability: ModelCapability },
  subjectCharacterId: CharacterId | null,
): Promise<{ readonly edit: AvatarReference | undefined; readonly warnings: readonly ImageryWarning[] }> {
  if (p.useAvatarReference !== true || subjectCharacterId === null) {
    return { edit: undefined, warnings: [] };
  }
  const card = await ctx.getCard(p.caller, subjectCharacterId);
  if (card.avatarAssetId === null) {
    return { edit: undefined, warnings: [] };
  }
  if (resolution.capability.input?.imageEdit !== true) {
    return {
      edit: undefined,
      warnings: [{ code: "image_edit_dropped", detail: `${resolution.model} lacks image-edit; generated without the avatar reference` }],
    };
  }
  const { bytes } = await ctx.readAsset(p.caller, card.avatarAssetId);
  // The avatar rides the img2img init channel.
  const edit: AvatarReference = { image: bytes };
  return { edit, warnings: [] };
}

/** Compose the runner `edit` payload from the B3 avatar reference (img2img `image`). Absent ⇒ `undefined`
 *  (a plain txt2img). */
function composeEdit(reference: AvatarReference | undefined): ImageGenerateRequest["edit"] {
  if (reference === undefined) {
    return;
  }
  return {
    ...(reference.image !== undefined ? { image: reference.image } : {}),
    ...(reference.references !== undefined ? { references: reference.references } : {}),
  };
}

/** The step-3 resolution the ORCHESTRATOR runs: a `prompt` override or `mode:"free"` is the user's literal
 *  words (source "user", zero side-LLM spend); otherwise the extraction/caption lanes run (chatId required —
 *  the shaper's history scope). */
async function orchestratorPrompt(
  resolvePrompt: ResolvePrompt,
  p: GeneratePictureParams,
): Promise<{ readonly prompt: string; readonly source: "user" | "extracted" | "captioned"; readonly costUsd: number | null }> {
  const userPrompt = p.prompt?.trim() ?? "";
  if (p.mode === "free") {
    if (userPrompt.length === 0) {
      throw new ImageryNotConfiguredError('imagery: "free" mode requires a prompt');
    }
    return { prompt: userPrompt, source: "user", costUsd: 0 };
  }
  if (userPrompt.length > 0) {
    // A prompt override on a template mode — specific intent, used verbatim (no extraction, doc 02 §1 step 3).
    return { prompt: userPrompt, source: "user", costUsd: 0 };
  }
  const chatId = p.chatId;
  if (chatId === undefined) {
    throw new ImageryNotConfiguredError(`imagery: mode "${p.mode}" requires a chatId for prompt extraction`);
  }
  return await resolvePrompt({ caller: p.caller, chatId, mode: p.mode, subjectCharacterId: p.subjectCharacterId });
}

/** The B2 hit path (doc 03 §4.4): rebuild the picture from a prior generation's stored rows — zero provider
 *  calls, `costUsd: null`, `reused: true`. `promptSource` derives from the mode (the gate only fires with no
 *  prompt override, so a portrait generation was captioned (multimodal) or extracted). */
function reusedResult(mode: GeneratePictureParams["mode"], hits: readonly ReuseRow[], first: ReuseRow): GeneratedPicture {
  const images = hits.map((h) => ({ assetId: h.assetId, generationId: h.generationId, block: buildBlock(h.assetId, h.prompt) }));
  return {
    images,
    prompt: first.prompt,
    promptSource: isMultimodalMode(mode) ? "captioned" : "extracted",
    mode,
    model: first.model,
    costUsd: null,
    reused: true,
    warnings: [],
  };
}

/** Step 2 (doc 03 §4.4): the B2 reuse gate + the identity hash the miss path stores. Runs only for a portrait
 *  mode with a subject and no prompt override. Returns the hit picture (short-circuit) or null, plus the
 *  `identityHash` the new rows store so the NEXT prefer-call hits. */
async function reuseGate(
  ctx: ImageryContext,
  p: GeneratePictureParams,
  subjectCharacterId: CharacterId | null,
): Promise<{ readonly identityHash: string | null; readonly hit: GeneratedPicture | null }> {
  const hasPromptOverride = (p.prompt?.trim() ?? "").length > 0;
  if (subjectCharacterId === null || hasPromptOverride) {
    return { identityHash: null, hit: null };
  }
  const card = await ctx.getCard(p.caller, subjectCharacterId);
  const identityHash = identityHashFor(p.mode, subjectCharacterId, card.contentHash);
  if ((p.reuse ?? "prefer") === "never") {
    return { identityHash, hit: null };
  }
  const hits = await findReusableGeneration(ctx.db, { ownerId: p.caller.userId, subjectCharacterId, mode: p.mode, identityHash });
  const first = hits[0];
  return { identityHash, hit: first !== undefined ? reusedResult(p.mode, hits, first) : null };
}

/** The hash written to the generation's provenance: the internal subject-character gate's hash wins (portrait
 *  modes own reuse); else, in `free` mode ONLY, an external consumer's precomputed hash (rpg-design/08 §2 — the
 *  additive passthrough letting a non-character consumer's OWN reuse gate short-circuit via `readProvenance`);
 *  null everywhere else (the additive-only guarantee — free/scenario/edit without a hash stay byte-identical). */
function provenanceHash(gateHash: string | null, p: GeneratePictureParams): string | null {
  return gateHash ?? (p.mode === "free" ? (p.identityHash ?? null) : null);
}

export function createGeneratePicture(ctx: ImageryContext, deps: { readonly resolvePrompt: ResolvePrompt }): ImageryService["generatePicture"] {
  return async (p: GeneratePictureParams): Promise<GeneratedPicture> => {
    // The subject the reuse gate + the provenance columns key on — only for a portrait mode carrying a subject.
    const subjectCharacterId = isPortraitMode(p.mode) && p.subjectCharacterId !== undefined ? p.subjectCharacterId : null;
    // Step 2: B2 reuse gate — a hit short-circuits before any provider call.
    const gate = await reuseGate(ctx, p, subjectCharacterId);
    if (gate.hit !== null) {
      return gate.hit;
    }
    const identityHash = provenanceHash(gate.identityHash, p);

    // Step 3: resolve the prompt (user | captioned | extracted).
    const resolved = await orchestratorPrompt(deps.resolvePrompt, p);
    // Step 4: prefix belt — re-assert the mode's required opening on an extracted/captioned prompt; a user's
    // literal words are used verbatim.
    const prompt = resolved.source === "user" ? resolved.prompt : ensurePrefix(resolved.prompt, p.mode);
    // Step 5: compose negative (DEFAULT_NEGATIVE + user's, appended) + size (preset or the mode default).
    const negativePrompt = composeNegative(p.negative);
    const size = SIZE_PRESETS[p.size ?? defaultSizeFor(p.mode)];

    // Step 6: resolve role + capability (one resolution — the B3 gate + the request build read the same model).
    const resolution = await resolveGenerateImageOrThrow(ctx, p.caller);
    // Step 7: B3 avatar-reference gate — an init image (or a drop-with-warning when the model can't edit).
    const reference = await avatarReferenceGate(ctx, p, { model: resolution.connection.model, capability: resolution.capability }, subjectCharacterId);
    const edit = composeEdit(reference.edit);

    // Steps 8-12: the shared generation tail (generate → materialize → store+provenance → stats).
    const outcome = await runGeneration(
      ctx,
      {
        credential: resolution.connection.credential,
        model: resolution.connection.model,
        owner: p.caller.userId,
        prompt,
        n: p.n ?? DEFAULT_IMAGE_COUNT,
        negativePrompt,
        size,
        ...(edit !== undefined ? { edit } : {}),
        // Forward the resolved capability the B3 gate read so the runner's belt sees the SAME model and conditions
        // on the avatar reference (rather than stripping it + falsely warning on an edit-capable model).
        capability: resolution.capability,
      },
      {
        caller: p.caller,
        chatId: p.chatId ?? null,
        mode: p.mode,
        subjectCharacterId,
        identityHash,
        prompt,
        negativePrompt,
        edited: reference.edit !== undefined,
      },
    );
    return {
      images: outcome.images,
      prompt,
      promptSource: resolved.source,
      mode: p.mode,
      model: outcome.model,
      // The returned total sums the extraction/caption spend (metered by chat's shaper, a different model
      // bucket) with the generation spend (recorded in stats by runGeneration).
      costUsd: sumCost(resolved.costUsd, outcome.costUsd),
      reused: false,
      // B3's drop warning + any runner edit-strip belt warning that flowed up (doc 03 §2).
      warnings: [...reference.warnings, ...outcome.warnings],
    };
  };
}
