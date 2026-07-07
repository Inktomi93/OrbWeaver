// verb: resolveVariant — the snap → cache → transform variant pipeline (D6). Produces a resized-webp
// variant of an owned blob: snap the requested width to the KIND's fixed ladder (`variant-policy`), read
// the per-user variant cache, and on a miss transform the owner's CAS original via the injected
// `imageTransform` (the `sharp` adapter — the width-snap is domain POLICY, sharp is infra I/O) and cache
// the result. TWO ladders: `icon` (width-only, any source aspect, `BLOB_WIDTHS`/`snapBlobWidth`) and
// `portrait` (2:3 smart-cropped, `PORTRAIT_WIDTHS`/`snapPortraitWidth` — `fit:'cover', position:'attention'`
// so a face-centric source isn't decapitated by a naive center-crop, §B.4).
//
// Returns `undefined` (→ 404) for: a malformed hash, an off-ladder/absurd width, or a blob the caller
// doesn't own. The per-user CAS keying is the physical gate — `cas.read(principal.userId, hash)` can only
// resolve the caller's own bytes (ENOENT ⇒ undefined); the blob route owner-gates via `getMetadata` first,
// so this verb operates on the already-resolved `(owner, hash)`. `isAssetHash` is checked BEFORE any path
// construction (the path-traversal defense — esoterica #1). `variants` is OPTIONAL: without it the verb
// degrades to recompute-every-time (a DR/rebuild env) — no cache read, no cache write.

import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";
import type { ResolveVariantParams } from "../contract/params";
import type { AssetsContext, AssetsService } from "../contract/service";
import { snapBlobWidth, snapPortraitWidth } from "../substrate/variant-policy";

const WEBP = "webp";

/** The `icon` ladder: width-only, any source aspect (the pre-existing behavior, untouched). */
async function resolveIconVariant(
  ctx: AssetsContext,
  ownerId: UserId,
  hash: string,
  width: number,
): Promise<Uint8Array | undefined> {
  const snapped = snapBlobWidth(width);
  if (snapped === undefined) {
    return;
  }
  const key = { kind: "icon" as const, width: snapped };
  const cached = await ctx.variants?.read(ownerId, hash, key);
  if (cached !== undefined) {
    return cached;
  }
  if (!(await ctx.cas.exists(ownerId, hash))) {
    return;
  }
  const original = await ctx.cas.read(ownerId, hash);
  const variant = await ctx.imageTransform(original, { width: snapped, format: WEBP });
  await ctx.variants?.put(ownerId, hash, key, variant);
  return variant;
}

/** The `portrait` ladder: 2:3 smart-cropped (`fit:'cover', position:'attention'` — face-safe, §B.4). */
async function resolvePortraitVariant(
  ctx: AssetsContext,
  ownerId: UserId,
  hash: string,
  width: number,
): Promise<Uint8Array | undefined> {
  const size = snapPortraitWidth(width);
  if (size === undefined) {
    return;
  }
  const key = { kind: "portrait" as const, width: size.width };
  const cached = await ctx.variants?.read(ownerId, hash, key);
  if (cached !== undefined) {
    return cached;
  }
  if (!(await ctx.cas.exists(ownerId, hash))) {
    return;
  }
  const original = await ctx.cas.read(ownerId, hash);
  const variant = await ctx.imageTransform(original, {
    width: size.width,
    height: size.height,
    fit: "cover",
    position: "attention",
    format: WEBP,
  });
  await ctx.variants?.put(ownerId, hash, key, variant);
  return variant;
}

export function createResolveVariant(ctx: AssetsContext): AssetsService["resolveVariant"] {
  return ({ principal, hash, width, kind }: ResolveVariantParams) => {
    if (!isAssetHash(hash)) {
      return Promise.resolve(undefined);
    }
    const ownerId = principal.userId;
    return kind === "portrait"
      ? resolvePortraitVariant(ctx, ownerId, hash, width)
      : resolveIconVariant(ctx, ownerId, hash, width);
  };
}
