// The shared generation tail both `generatePicture` (I1/I3) and `editImage` (I4) run: ONE `generateImage(req)`
// call (the provider fans out `n`, never a per-image loop) → materialize per image (base64 decode or SSRF-safe
// URL download) → store-then-provenance per image → economics → surface the runner's edit-strip warnings. The
// verb-specific parts (prompt resolution, reuse gate, the B3/edit capability gates, the request build) live in
// each verb; this is the spend-and-persist core, so the store-then-provenance GC ordering has ONE home.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import type { StatsDelta } from "@orb/contracts/stats";
import type { AssetId, ModelId, UserConnectionId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import { utcDay } from "@orb/kit/stats-tally";
import { GenerationFailedError } from "../contract/errors.ts";
import type { GeneratedPictureImage, GenerationOutcome, GenerationProvenanceInput } from "../contract/results.ts";
import type { GeneratedImage, ImageGenerateRequest, ImageryContext } from "../contract/service.ts";
import { insertGeneration } from "../persistence/queries.ts";

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
 *  SSRF-safe `fetchImage` port (the URL is provider-response-controlled, never fetched raw). `null` when
 *  the image carries neither shape or the download fails. */
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

/** The media block for one stored image. Exported for the reuse path, which rebuilds blocks from stored rows. */
export function buildBlock(assetId: AssetId, prompt: string): MessageContentBlock {
  return { kind: "media", media: "image", src: { kind: "asset", assetId }, alt: prompt.slice(0, ALT_MAX_CHARS) };
}

/** Store the bytes (kind `"generated"`) then write the provenance row (order matters — a crash between leaves
 *  an unreferenced CAS blob the assets GC reaps benignly, never a provenance row pointing at nothing) and
 *  return the render-ready image. */
async function persistImage(
  ctx: ImageryContext,
  prov: GenerationProvenanceInput,
  gen: {
    readonly model: ModelId;
    readonly providerId: ProviderId;
    readonly connectionId: UserConnectionId;
    readonly costUsd: number | null;
    readonly createdAt: number;
    readonly img: DecodedImage;
  },
): Promise<GeneratedPictureImage> {
  // Derive the claimed mime from the bytes via the shared `@orb/kit/image-sniff` table — the same one assets'
  // `enforceMagic` re-checks against. On the unrecognized sentinel, fall back to the provider mediaType then PNG.
  const sniffed = sniffMime(gen.img.bytes);
  const mime = sniffed === OCTET_STREAM ? (gen.img.mediaType ?? DEFAULT_IMAGE_MIME) : sniffed;
  const stored = await ctx.storeAsset(prov.caller, gen.img.bytes, "generated", mime);
  const generationId = ctx.newGenerationId();
  await insertGeneration(ctx.db, {
    id: generationId,
    assetId: stored.assetId,
    chatId: prov.chatId,
    mode: prov.mode,
    subjectCharacterId: prov.subjectCharacterId,
    identityHash: prov.identityHash,
    prompt: prov.prompt,
    negativePrompt: prov.negativePrompt,
    model: gen.model,
    providerId: gen.providerId,
    connectionId: gen.connectionId,
    costUsd: gen.costUsd,
    edited: prov.edited,
    createdAt: gen.createdAt,
  });
  return { assetId: stored.assetId, generationId, block: buildBlock(stored.assetId, prov.prompt) };
}

/** The generation's economics delta — attributed to `caller` as owner, one model bucket, `count` generations. */
function buildDelta(args: {
  readonly caller: Principal;
  readonly model: ModelId;
  readonly providerId: ProviderId;
  readonly costUsd: number | null;
  readonly count: number;
  readonly now: number;
}): StatsDelta {
  return {
    ownerId: args.caller.userId,
    characterId: null,
    day: utcDay(args.now),
    model: args.model,
    provider: args.providerId,
    modelGenerations: args.count,
    modelGenSamples: args.count,
    now: args.now,
    ...(args.costUsd !== null ? { costUsd: args.costUsd, modelCostUsd: args.costUsd } : {}),
  };
}

/** Null-propagating sum (doc 02 §8): any unknown component ⇒ null (a fabricated partial total is worse than an
 *  honest null); the known parts still land in stats individually. */
export function sumCost(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

/** Run one built request through the spend-and-persist tail. Zero decodable images ⇒ `GenerationFailedError`. */
export async function runGeneration(ctx: ImageryContext, req: ImageGenerateRequest, prov: GenerationProvenanceInput): Promise<GenerationOutcome> {
  const result = await ctx.generateImage(req);
  const model = modelIdSchema.parse(result.model);
  const decoded = (await Promise.all(result.images.map((img) => materialize(ctx, img)))).filter((d): d is DecodedImage => d !== null);
  if (decoded.length === 0) {
    throw new GenerationFailedError("imagery: the image provider returned zero decodable images");
  }
  // Capture the clock ONCE so all n provenance rows share a `createdAt` — the reuse lookup groups a fanned-out
  // generation by that timestamp.
  const createdAt = ctx.now();
  const images: GeneratedPictureImage[] = [];
  for (const img of decoded) {
    images.push(
      await persistImage(ctx, prov, {
        model,
        providerId: req.connection.providerId,
        connectionId: req.connection.connectionId,
        costUsd: result.usage.costUsd,
        createdAt,
        img,
      }),
    );
  }
  await ctx.recordStats(
    buildDelta({
      caller: prov.caller,
      model,
      providerId: req.connection.providerId,
      costUsd: result.usage.costUsd,
      count: images.length,
      now: createdAt,
    }),
  );
  return { images, model, costUsd: result.usage.costUsd, warnings: result.warnings };
}
