// The snap → cache → transform variant pipeline: snap the requested width to the KIND's fixed ladder
// (variant-policy), read the per-user variant cache, and on a miss transform the owner's CAS original via
// the injected `imageTransform`. Returns undefined (→ 404) for a malformed hash, off-ladder width, or a blob
// the caller doesn't own — `isAssetHash` is checked before any path construction (path-traversal defense).

import type { VariantKind } from "@orb/contracts/assets";
import { isAssetHash } from "@orb/kit/assets";
import type { UserId } from "@orb/kit/ids";
import { isAnimated } from "@orb/kit/image-sniff";
import type { AssetsContext } from "../context.ts";
import type { ResolveVariantParams } from "../contract/params.ts";
import type { AssetsService } from "../contract/service.ts";
import { snapBannerWidth, snapBlobWidth, snapPortraitWidth } from "../substrate/variant-policy.ts";

const WEBP = "webp";
// The fallback when a context doesn't inject the live quality getter (tests) — byte-identical to infra/image
// DEFAULT_QUALITY. The LIVE value comes from ctx.imageVariantQuality (item 6), folded into the cache key.
const DEFAULT_VARIANT_QUALITY = 80;

/** The `icon` ladder: width-only, any source aspect (the pre-existing behavior, untouched). */
async function resolveIconVariant(ctx: AssetsContext, ownerId: UserId, hash: string, width: number): Promise<Uint8Array | undefined> {
  const snapped = snapBlobWidth(width);
  if (snapped === undefined) {
    return;
  }
  const quality = ctx.imageVariantQuality?.() ?? DEFAULT_VARIANT_QUALITY;
  const key = { kind: "icon" as const, width: snapped, quality };
  const cached = await ctx.variants?.read(ownerId, hash, key);
  if (cached !== undefined) {
    return cached;
  }
  if (!(await ctx.cas.exists(ownerId, hash))) {
    return;
  }
  const original = await ctx.cas.read(ownerId, hash);
  // sharp's webp encoder drops animation on re-encode; serve animated sources verbatim, uncached.
  if (isAnimated(original)) {
    return original;
  }
  const variant = await ctx.imageTransform(original, { width: snapped, format: WEBP, quality });
  await ctx.variants?.put(ownerId, hash, key, variant);
  return variant;
}

/** The `portrait` ladder: 2:3 smart-cropped (`fit:'cover', position:'attention'` — face-safe, §B.4). */
async function resolvePortraitVariant(ctx: AssetsContext, ownerId: UserId, hash: string, width: number): Promise<Uint8Array | undefined> {
  const size = snapPortraitWidth(width);
  if (size === undefined) {
    return;
  }
  const quality = ctx.imageVariantQuality?.() ?? DEFAULT_VARIANT_QUALITY;
  const key = { kind: "portrait" as const, width: size.width, quality };
  const cached = await ctx.variants?.read(ownerId, hash, key);
  if (cached !== undefined) {
    return cached;
  }
  if (!(await ctx.cas.exists(ownerId, hash))) {
    return;
  }
  const original = await ctx.cas.read(ownerId, hash);
  // sharp's webp encoder drops animation on re-encode; serve animated sources verbatim, uncached.
  if (isAnimated(original)) {
    return original;
  }
  const variant = await ctx.imageTransform(original, {
    width: size.width,
    height: size.height,
    fit: "cover",
    position: "attention",
    format: WEBP,
    quality,
  });
  await ctx.variants?.put(ownerId, hash, key, variant);
  return variant;
}

/** The `banner` ladder: 3:1 smart-cropped. Same shape as {@link resolvePortraitVariant}, a different fixed aspect. */
async function resolveBannerVariant(ctx: AssetsContext, ownerId: UserId, hash: string, width: number): Promise<Uint8Array | undefined> {
  const size = snapBannerWidth(width);
  if (size === undefined) {
    return;
  }
  const quality = ctx.imageVariantQuality?.() ?? DEFAULT_VARIANT_QUALITY;
  const key = { kind: "banner" as const, width: size.width, quality };
  const cached = await ctx.variants?.read(ownerId, hash, key);
  if (cached !== undefined) {
    return cached;
  }
  if (!(await ctx.cas.exists(ownerId, hash))) {
    return;
  }
  const original = await ctx.cas.read(ownerId, hash);
  // sharp's webp encoder drops animation on re-encode; serve animated sources verbatim, uncached.
  if (isAnimated(original)) {
    return original;
  }
  const variant = await ctx.imageTransform(original, {
    width: size.width,
    height: size.height,
    fit: "cover",
    position: "attention",
    format: WEBP,
    quality,
  });
  await ctx.variants?.put(ownerId, hash, key, variant);
  return variant;
}

type VariantResolver = (ctx: AssetsContext, ownerId: UserId, hash: string, width: number) => Promise<Uint8Array | undefined>;

/** Exhaustive `kind` → resolver dispatch: a 4th `VariantKind` member fails `tsc` here. */
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
