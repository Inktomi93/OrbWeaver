// The binary blob-serve registrar. `GET /api/blob/:hash` serves an owned CAS blob; `?w=<px>` serves a
// resized-webp variant (icon/portrait/banner via `?v=`). Owner-gated, not unauthenticated — a blob the
// caller doesn't own is indistinguishable from a missing one (both → 404, no foreign-existence leak).
//
// Both `assets` AND `cas` are needed: assets owns the index + variant pipeline but exposes no
// raw-original read, so the full-size original is served from the per-user CAS directly; `getMetadata` is
// still the gate before any byte read.

import type { VariantKind } from "@orb/contracts/assets";
import { BLOB_ROUTE, variantKindSchema } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import type { Hono } from "hono";
import type { AssetMetadata } from "#domain/assets";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const WEBP_MIME = "image/webp";
// Per-user cache: the response is scoped to one owner's session, immutable by content-address.
const CACHE_CONTROL = "private, immutable";
const DEFAULT_VARIANT_KIND: VariantKind = "icon";

/** The `assets` front-door slice the blob route consumes. `getMetadata` may include `ownerId` for the
 *  roster-avatar path. */
export interface BlobAssetsPort {
  readonly getMetadata: (params: { readonly principal: Principal; readonly hash: string }) => Promise<AssetMetadata | undefined>;
  readonly resolveVariant: (params: {
    readonly principal: Principal;
    readonly hash: string;
    readonly width: number;
    readonly kind: VariantKind;
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

interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null };
}

/** Register `GET /api/blob/:hash` (+ the `?w=` variant) on `app`. */
export function registerBlob(app: Hono<PrincipalEnv>, deps: BlobDeps): void {
  app.get(`${BLOB_ROUTE}/:hash`, async (c) => {
    const principal = c.get("principal");
    if (principal === null) {
      return c.body(null, UNAUTHORIZED);
    }
    const hash = c.req.param("hash");

    const widthRaw = c.req.query("w");
    if (widthRaw !== undefined) {
      return serveVariant(deps, principal, {
        hash,
        widthRaw,
        kindRaw: c.req.query("v"),
      });
    }

    const meta = await deps.assets.getMetadata({ principal, hash });
    if (meta === undefined) {
      return c.body(null, NOT_FOUND);
    }
    // meta.ownerId is set when the asset belongs to a co-participant (roster-avatar exception); on the
    // normal path it is absent and the caller IS the owner.
    const casOwnerId = (meta.ownerId as UserId | undefined) ?? principal.userId;
    try {
      const bytes = await deps.cas.read(casOwnerId, hash);
      return serveBytes(bytes, meta.mime);
    } catch {
      return c.body(null, NOT_FOUND);
    }
  });
}

/** Parse the `?v=` variant-kind query value. Omitted ⇒ the `icon` floor; present-but-invalid ⇒
 *  `undefined` — the caller 404s rather than silently falling back. */
function parseVariantKind(raw: string | undefined): VariantKind | undefined {
  if (raw === undefined) {
    return DEFAULT_VARIANT_KIND;
  }
  const parsed = variantKindSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Serve a resized-webp variant. An off-ladder width, malformed `?v=`, non-hash, or unowned blob all
 *  resolve to `undefined` → 404. */
async function serveVariant(
  deps: BlobDeps,
  principal: Principal,
  query: { readonly hash: string; readonly widthRaw: string; readonly kindRaw: string | undefined },
): Promise<Response> {
  const { hash, widthRaw, kindRaw } = query;
  const width = Number(widthRaw);
  const kind = parseVariantKind(kindRaw);
  if (!Number.isInteger(width) || width <= 0 || kind === undefined) {
    return new Response(null, { status: NOT_FOUND });
  }
  const variant = await deps.assets.resolveVariant({ principal, hash, width, kind });
  if (variant === undefined) {
    return new Response(null, { status: NOT_FOUND });
  }
  return serveBytes(variant, WEBP_MIME);
}

function serveBytes(bytes: Uint8Array, mime: string): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
