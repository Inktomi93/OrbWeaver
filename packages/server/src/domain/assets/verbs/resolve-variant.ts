// verb: resolveVariant — the snap → cache → transform variant pipeline (D6). Produces a resized-webp
// variant of an owned blob: snap the requested width to the KIND's fixed ladder (`variant-policy`), read
// the per-user variant cache, and on a miss transform the owner's CAS original via the injected
// `imageTransform` (the `sharp` adapter — the width-snap is domain POLICY, sharp is infra I/O) and cache
// the result. THREE ladders, dispatched via the `VARIANT_RESOLVERS` mapped-`Record` (Spine string-union
// dispatch discipline §5.5 — a 4th `VariantKind` member fails `tsc` here, never a silent ternary
// fallthrough): `icon` (width-only, any source aspect, `BLOB_WIDTHS`/`snapBlobWidth`), `portrait` (2:3
// smart-cropped, `PORTRAIT_WIDTHS`/`snapPortraitWidth`) and `banner` (3:1 smart-cropped,
// `BANNER_WIDTHS`/`snapBannerWidth`, Whisper's header-art band) — both crops `fit:'cover',
// position:'attention'` so a face-centric source isn't decapitated by a naive center-crop, §B.4).
//
// ANIMATED BAILOUT (gallery-design §2, G2): once the owner's original bytes are read, an animated source
// (GIF/APNG/animated-WebP — `@orb/kit/image-sniff` `isAnimated`) short-circuits BEFORE the sharp transform
// and is returned verbatim (sharp drops animation on re-encode); no variant-cache entry is written.
//
// Returns `undefined` (→ 404) for: a malformed hash, an off-ladder/absurd width, or a blob the caller
// doesn't own. The per-user CAS keying is the physical gate — `cas.read(principal.userId, hash)` can only
// resolve the caller's own bytes (ENOENT ⇒ undefined); the blob route owner-gates via `getMetadata` first,
// so this verb operates on the already-resolved `(owner, hash)`. `isAssetHash` is checked BEFORE any path
// construction (the path-traversal defense — esoterica #1). `variants` is OPTIONAL: without it the verb
// degrades to recompute-every-time (a DR/rebuild env) — no cache read, no cache write.

import type { VariantKind } from "@orb/contracts/assets";
import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";
import { isAnimated } from "@orb/kit/image-sniff";
import type { ResolveVariantParams } from "../contract/params";
import type { AssetsContext, AssetsService } from "../contract/service";
import { snapBannerWidth, snapBlobWidth, snapPortraitWidth } from "../substrate/variant-policy";

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
  // Animated bailout (gallery-design §2): sharp's webp encoder DROPS animation, so downscaling an animated
  // GIF/APNG/WebP freeze-frames it. Serve the original bytes verbatim and write NO variant-cache entry (the
  // original IS the response — caching a byte-identical copy under a variant key doubles storage for nothing).
  if (isAnimated(original)) {
    return original;
  }
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
  // Animated bailout (gallery-design §2): sharp's webp encoder DROPS animation, so downscaling an animated
  // GIF/APNG/WebP freeze-frames it. Serve the original bytes verbatim and write NO variant-cache entry (the
  // original IS the response — caching a byte-identical copy under a variant key doubles storage for nothing).
  if (isAnimated(original)) {
    return original;
  }
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

/** The `banner` ladder: 3:1 smart-cropped (`fit:'cover', position:'attention'` — face-safe, Whisper's
 *  header-art band). Same shape as {@link resolvePortraitVariant}, a different fixed aspect. */
async function resolveBannerVariant(
  ctx: AssetsContext,
  ownerId: UserId,
  hash: string,
  width: number,
): Promise<Uint8Array | undefined> {
  const size = snapBannerWidth(width);
  if (size === undefined) {
    return;
  }
  const key = { kind: "banner" as const, width: size.width };
  const cached = await ctx.variants?.read(ownerId, hash, key);
  if (cached !== undefined) {
    return cached;
  }
  if (!(await ctx.cas.exists(ownerId, hash))) {
    return;
  }
  const original = await ctx.cas.read(ownerId, hash);
  // Animated bailout (gallery-design §2): sharp's webp encoder DROPS animation, so downscaling an animated
  // GIF/APNG/WebP freeze-frames it. Serve the original bytes verbatim and write NO variant-cache entry (the
  // original IS the response — caching a byte-identical copy under a variant key doubles storage for nothing).
  if (isAnimated(original)) {
    return original;
  }
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

type VariantResolver = (
  ctx: AssetsContext,
  ownerId: UserId,
  hash: string,
  width: number,
) => Promise<Uint8Array | undefined>;

/** The exhaustive `kind` → resolver dispatch (Spine §5.5 — a mapped `Record`, not a ternary/switch): a 4th
 *  `VariantKind` member fails `tsc` here rather than silently falling through to the wrong ladder. */
const VARIANT_RESOLVERS: Record<VariantKind, VariantResolver> = {
  icon: resolveIconVariant,
  portrait: resolvePortraitVariant,
  banner: resolveBannerVariant,
};

export function createResolveVariant(ctx: AssetsContext): AssetsService["resolveVariant"] {
  return ({ principal, hash, width, kind }: ResolveVariantParams) => {
    if (!isAssetHash(hash)) {
      return Promise.resolve(undefined);
    }
    return VARIANT_RESOLVERS[kind](ctx, principal.userId, hash, width);
  };
}
