// verb: resolveVariant — the snap → cache → transform variant pipeline (D6). Produces a resized-webp
// variant of an owned blob: snap the requested width to the fixed ladder (`variant-policy`), read the
// per-user variant cache, and on a miss transform the owner's CAS original via the injected `imageTransform`
// (the `sharp` adapter — the width-snap is domain POLICY, sharp is infra I/O) and cache the result.
//
// Returns `undefined` (→ 404) for: a malformed hash, an off-ladder/absurd width, or a blob the caller
// doesn't own. The per-user CAS keying is the physical gate — `cas.read(principal.userId, hash)` can only
// resolve the caller's own bytes (ENOENT ⇒ undefined); the blob route owner-gates via `getMetadata` first,
// so this verb operates on the already-resolved `(owner, hash)`. `isAssetHash` is checked BEFORE any path
// construction (the path-traversal defense — esoterica #1). `variants` is OPTIONAL: without it the verb
// degrades to recompute-every-time (a DR/rebuild env) — no cache read, no cache write.

import { isAssetHash } from "@orb/kit/assets";
import type { ResolveVariantParams } from "../contract/params";
import type { AssetsContext, AssetsService } from "../contract/service";
import { snapBlobWidth } from "../substrate/variant-policy";

const WEBP = "webp";

export function createResolveVariant(ctx: AssetsContext): AssetsService["resolveVariant"] {
  return async ({ principal, hash, width }: ResolveVariantParams) => {
    if (!isAssetHash(hash)) {
      return;
    }
    const snapped = snapBlobWidth(width);
    if (snapped === undefined) {
      return;
    }
    const ownerId = principal.userId;

    const cached = await ctx.variants?.read(ownerId, hash, snapped);
    if (cached !== undefined) {
      return cached;
    }

    // Cache miss — recompute from the owner's CAS original. A non-owner's id can't resolve it (404).
    if (!(await ctx.cas.exists(ownerId, hash))) {
      return;
    }
    const original = await ctx.cas.read(ownerId, hash);
    const variant = await ctx.imageTransform(original, { width: snapped, format: WEBP });
    await ctx.variants?.put(ownerId, hash, snapped, variant);
    return variant;
  };
}
