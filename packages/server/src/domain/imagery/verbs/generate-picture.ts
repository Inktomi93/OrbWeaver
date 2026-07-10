// verb: generatePicture — the orchestrator (imagery-design/02 §1, MINIMAL free-mode arm). Order (P5 subset,
// steps 1 / 3-free / 6 / 8-12; the reuse/negative/avatar/extract steps are Phase 7):
//   1. assert `prompt` present (free mode is the only P5 mode; a mode without a prompt would need Phase-7
//      extraction → ImageryNotConfiguredError).
//   6. resolve the generateImage role (no role/credential → ImageryNotConfiguredError).
//   8. ONE `generateImage(req)` call with `n` (the provider fans out; never a per-image loop).
//   9. materialize per returned image (base64 decode | provider-URL download via the SSRF-safe `fetchImage`
//      port — the URL is provider-response-controlled, never fetched raw); sniff mime from bytes.
//  10. store-THEN-provenance per image (a mid-loop crash leaves a benign orphan blob, never a dangling row).
//  11. build one D44 media block per image.
//  12. record economics + return.
// Zero decodable images → GenerationFailedError.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { StatsDelta } from "@orb/contracts/stats";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import { modelKey, utcDay } from "@orb/kit/stats-tally";
import { GenerationFailedError, ImageryNotConfiguredError } from "../contract/errors";
import type { GeneratePictureParams } from "../contract/params";
import type { GeneratedPicture, GeneratedPictureImage } from "../contract/results";
import type { GeneratedImage, ImageryContext, ImageryService } from "../contract/service";
import { insertGeneration } from "../persistence/queries";

/** Default fan-out when the caller omits `n` (the wire clamps to 1..4). */
const DEFAULT_IMAGE_COUNT = 1;
/** The media block's `alt` is the prompt, truncated (a full 2k-char prompt is not alt text). */
const ALT_MAX_CHARS = 300;
/** The fallback mime when neither the bytes nor the provider name an image type. */
const DEFAULT_IMAGE_MIME = "image/png";
/** `@orb/kit/image-sniff`'s "unrecognized signature" sentinel — the SAME table assets' `enforceMagic` uses. */
const OCTET_STREAM = "application/octet-stream";

/** The materialized bytes of one returned image + the provider's claimed media type (a sniff fallback). */
interface DecodedImage {
  readonly bytes: Uint8Array;
  readonly mediaType: string | undefined;
}

/** Decode one returned image to bytes: inline base64 → decode; provider URL → download via the injected
 *  SSRF-safe `fetchImage` port. The URL is NOT first-party — it is whatever the chosen (OpenRouter-
 *  marketplace) model provider put in `message.images[].imageUrl.url`, so a malicious/compromised image
 *  provider could aim it at a loopback / link-local / RFC1918 target; the port routes it through
 *  `safeFetch` (SSRF firewall + byte cap) and returns `null` on any block/failure. Null also when the
 *  image carries neither shape or the download fails (dropped; a zero-image result throws downstream). */
async function materialize(ctx: ImageryContext, img: GeneratedImage): Promise<DecodedImage | null> {
  if (img.base64 !== undefined && img.base64.length > 0) {
    return { bytes: new Uint8Array(Buffer.from(img.base64, "base64")), mediaType: img.mediaType };
  }
  if (img.url !== undefined && img.url.length > 0) {
    const bytes = await ctx.fetchImage(img.url);
    return bytes === null ? null : { bytes, mediaType: img.mediaType };
  }
  return null;
}

/** The D44 media block for one stored image (imagery-design/02 step 11 — verified against
 *  `@orb/contracts/chat` `messageContentBlockSchema`). */
function buildBlock(assetId: AssetId, prompt: string): MessageContentBlock {
  return {
    kind: "media",
    media: "image",
    src: { kind: "asset", assetId },
    alt: prompt.slice(0, ALT_MAX_CHARS),
  };
}

/** The per-image store-then-provenance args (an interface — not 5 positional params). */
interface PersistArgs {
  readonly caller: Principal;
  readonly chatId: ChatId | null;
  readonly mode: PromptTemplateMode;
  readonly prompt: string;
  readonly model: string;
  readonly costUsd: number | null;
  readonly img: DecodedImage;
}

/** Store the bytes (kind `"generated"`) THEN write the provenance row (order matters — imagery-design/02
 *  step 10) and return the render-ready image. */
async function persistImage(
  ctx: ImageryContext,
  args: PersistArgs,
): Promise<GeneratedPictureImage> {
  // Derive the claimed mime from the bytes via the SHARED `@orb/kit/image-sniff` table — the exact one
  // assets' `enforceMagic` re-checks against, so a recognized signature is guaranteed to pass that gate (the
  // forked local copy DIVERGED — e.g. GIF prefix vs strict GIF87a/89a — and could slip a mismatch into a paid
  // store; PD-123). On the unrecognized sentinel the caller policy falls back to the provider mediaType then
  // PNG (per the kit header — the caller owns the fallback, not kit).
  const sniffed = sniffMime(args.img.bytes);
  const mime = sniffed === OCTET_STREAM ? (args.img.mediaType ?? DEFAULT_IMAGE_MIME) : sniffed;
  const stored = await ctx.storeAsset(args.caller, args.img.bytes, "generated", mime);
  const generationId = ctx.newGenerationId();
  await insertGeneration(ctx.db, {
    id: generationId,
    assetId: stored.assetId,
    chatId: args.chatId,
    mode: args.mode,
    prompt: args.prompt,
    model: args.model,
    costUsd: args.costUsd,
    edited: false,
    createdAt: ctx.now(),
  });
  return { assetId: stored.assetId, generationId, block: buildBlock(stored.assetId, args.prompt) };
}

/** The generation's economics delta (imagery-design/02 §8) — attributed to `caller` as owner, one model
 *  bucket, `count` generations. */
function buildDelta(args: {
  readonly caller: Principal;
  readonly model: string;
  readonly costUsd: number | null;
  readonly count: number;
  readonly now: number;
}): StatsDelta {
  const { model, provider } = modelKey(args.model, null);
  return {
    ownerId: args.caller.userId,
    characterId: null,
    day: utcDay(args.now),
    model,
    provider,
    modelGenerations: args.count,
    modelGenSamples: args.count,
    now: args.now,
    ...(args.costUsd !== null ? { costUsd: args.costUsd, modelCostUsd: args.costUsd } : {}),
  };
}

async function resolveConnection(
  ctx: ImageryContext,
  caller: Principal,
): Promise<Awaited<ReturnType<ImageryContext["resolveGenerateImage"]>>["connection"]> {
  try {
    const resolved = await ctx.resolveGenerateImage(caller);
    return resolved.connection;
  } catch (err) {
    const error = new ImageryNotConfiguredError(
      "imagery: no generateImage role is configured for this caller",
    );
    error.cause = err;
    throw error;
  }
}

export function createGeneratePicture(ctx: ImageryContext): ImageryService["generatePicture"] {
  return async (p: GeneratePictureParams): Promise<GeneratedPicture> => {
    const prompt = p.prompt?.trim() ?? "";
    if (prompt.length === 0) {
      throw new ImageryNotConfiguredError(
        `imagery: mode "${p.mode}" requires a prompt in this phase (prompt extraction is not yet available)`,
      );
    }
    const connection = await resolveConnection(ctx, p.caller);
    const result = await ctx.generateImage({
      credential: connection.credential,
      model: connection.model,
      prompt,
      n: p.n ?? DEFAULT_IMAGE_COUNT,
    });
    const decoded = (await Promise.all(result.images.map((img) => materialize(ctx, img)))).filter(
      (d): d is DecodedImage => d !== null,
    );
    if (decoded.length === 0) {
      throw new GenerationFailedError("imagery: the image provider returned zero decodable images");
    }
    const images: GeneratedPictureImage[] = [];
    for (const img of decoded) {
      images.push(
        // biome-ignore lint/performance/noAwaitInLoops: intentionally sequential — store-then-provenance ordering (step 10 above).
        await persistImage(ctx, {
          caller: p.caller,
          chatId: p.chatId ?? null,
          mode: p.mode,
          prompt,
          model: result.model,
          costUsd: result.usage.costUsd,
          img,
        }),
      );
    }
    await ctx.recordStats(
      buildDelta({
        caller: p.caller,
        model: result.model,
        costUsd: result.usage.costUsd,
        count: images.length,
        now: ctx.now(),
      }),
    );
    return {
      images,
      prompt,
      promptSource: "user",
      mode: p.mode,
      model: result.model,
      costUsd: result.usage.costUsd,
      reused: false,
      warnings: [],
    };
  };
}
