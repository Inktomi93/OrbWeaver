// entry/http/blob — the binary blob-serve registrar (core/Tier-5-Entry.md §layout "blob.ts").
// `GET /api/blob/:hash` serves an owned CAS blob; `?w=<px>` (the client always pairs it with
// `f=webp`) serves a resized-webp variant. It composes the `assets` front door (the owner-gate
// `getMetadata` + the `resolveVariant` snap→cache→transform pipeline, D6) with the `infra/storage` CAS
// (the original bytes). Per D21 the route is OWNER-GATED, not unauthenticated — the caller's `Principal`
// (resolved by `app.ts`'s auth middleware, read off the request context) scopes ownership; a blob the
// caller doesn't own is indistinguishable from a missing one (both → 404, no foreign-existence leak).
//
// Why both `assets` AND `cas`: the assets front door owns the index + the variant pipeline, but exposes no
// raw-original read (its user-facing surface is store/getMetadata/resolveVariant). The full-size
// original is served from the per-user CAS directly (`cas.read(ownerId, hash)`); `getMetadata` is still
// the gate (it owner-scopes + yields the stored mime) before any byte read. The width-snap policy + `sharp`
// stay OUT of this tier — `resolveVariant` does both behind the front door (D6).

import { BLOB_ROUTE } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { AssetMetadata } from "#domain/assets";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const WEBP_MIME = "image/webp";
// Per-user cache (D21 — was neo's `public`): the response is scoped to one owner's session, immutable by
// content-address (a hash never changes its bytes).
const CACHE_CONTROL = "private, immutable";

/** The `assets` front-door slice the blob route consumes (the owner-gate + the variant pipeline).
 *  `getMetadata` returns `AssetMetadata` (may include `ownerId` for the PD-28 roster-avatar path). */
export interface BlobAssetsPort {
  readonly getMetadata: (params: {
    readonly principal: Principal;
    readonly hash: string;
  }) => Promise<AssetMetadata | undefined>;
  readonly resolveVariant: (params: {
    readonly principal: Principal;
    readonly hash: string;
    readonly width: number;
  }) => Promise<Uint8Array | undefined>;
}

/** The `infra/storage` CAS slice the blob route reads originals from (per-user keyed). */
export interface BlobCasPort {
  readonly read: (ownerId: UserId, hash: string) => Promise<Uint8Array>;
}

export interface BlobDeps {
  readonly assets: BlobAssetsPort;
  readonly cas: BlobCasPort;
}

/** The request-context shape `app.ts` populates: the resolved caller (or `null` when anonymous). */
interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/** Register `GET /api/blob/:hash` (+ the `?w=` variant) on `app`. The caller is read from the request
 *  context (`app.ts` resolves it); blob serve needs no CSRF (a read), only ownership. */
export function registerBlob(app: Hono<PrincipalEnv>, deps: BlobDeps): void {
  app.get(`${BLOB_ROUTE}/:hash`, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      // Anonymous can own nothing → no body (don't leak whether the hash exists).
      return c.body(null, UNAUTHORIZED);
    }
    const hash = c.req.param("hash");

    // Variant path: `?w=<px>` → the resized-webp pipeline (snap→cache→transform behind the front door).
    const widthRaw = c.req.query("w");
    if (widthRaw !== undefined) {
      return serveVariant(deps, principal, hash, widthRaw);
    }

    // Original path: gate on ownership + read the stored mime, THEN read the per-user CAS original.
    const meta = await deps.assets.getMetadata({ principal, hash });
    if (meta === undefined) {
      return c.body(null, NOT_FOUND);
    }
    // PD-28: meta.ownerId is set when the asset belongs to a co-participant (roster-avatar exception);
    // on the normal path it is absent and the caller IS the owner.
    const casOwnerId = (meta.ownerId as UserId | undefined) ?? principal.userId;
    try {
      const bytes = await deps.cas.read(casOwnerId, hash);
      return serveBytes(bytes, meta.mime);
    } catch {
      // Row present but blob absent (a torn delete) → 404, never a 500 leak.
      return c.body(null, NOT_FOUND);
    }
  });
}

/** Serve a resized-webp variant: snap width → cache → transform (all behind the front door). An
 *  off-ladder width, non-hash, or unowned blob all resolve to `undefined` → 404. */
async function serveVariant(
  deps: BlobDeps,
  principal: Principal,
  hash: string,
  widthRaw: string,
): Promise<Response> {
  const width = Number(widthRaw);
  if (!Number.isInteger(width) || width <= 0) {
    return new Response(null, { status: NOT_FOUND });
  }
  const variant = await deps.assets.resolveVariant({ principal, hash, width });
  if (variant === undefined) {
    return new Response(null, { status: NOT_FOUND });
  }
  return serveBytes(variant, WEBP_MIME);
}

/** Build the binary response (content-type + length + the per-user immutable cache header). */
function serveBytes(bytes: Uint8Array, mime: string): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
