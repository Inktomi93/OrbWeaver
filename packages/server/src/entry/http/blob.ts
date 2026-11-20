// The binary blob-serve registrar. `GET /api/blob/:hash` serves an owned CAS blob; `?w=<px>` serves a
// resized-webp variant (icon/portrait/banner via `?v=`). Owner-gated, not unauthenticated — a blob the
// caller doesn't own is indistinguishable from a missing one (both → 404, no foreign-existence leak).
//
// Both `assets` AND `cas` are needed: assets owns the index + variant pipeline but exposes no
// raw-original read, so the full-size original is served from the per-user CAS directly; `getMetadata` is
// still the gate before any byte read.

import type { InlineServedMime, VariantKind } from "@orb/contracts/assets";
import { BLOB_ROUTE, INLINE_SERVED_MIMES, variantKindSchema } from "@orb/contracts/assets";
import type { Principal } from "@orb/contracts/identity";
import { sniffMime } from "@orb/kit/image-sniff";
import type { Hono } from "hono";
import type { AssetsService } from "#domain/assets";
import { readTornAsMiss } from "#domain/assets";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { Cas } from "#infra/storage";
import type { PrincipalEnv } from "./contract/request-env.ts";

/** The assets slice this registrar consumes, derived from the service rather than restated. */
export type BlobAssetsPort = Pick<AssetsService, "getMetadata" | "resolveVariant">;

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const WEBP_MIME = "image/webp";
// Per-user cache: the response is scoped to one owner's session, immutable by content-address.
const CACHE_CONTROL = "private, immutable";
const DEFAULT_VARIANT_KIND: VariantKind = "icon";
// Serve-boundary neutralization. A blob is served from the app's OWN origin, so a stored HTML/JS/SVG
// asset navigated-to or `<script src=/api/blob/…>`-chained would execute with the owner's cookies: the app
// CSP's `script-src 'self'` permits the same-origin script chain and `nosniff` does not help (text/javascript
// is a real script type). So only a stored type that EQUALS one of `INLINE_SERVED_MIMES` is served inline,
// under that exact value; everything else — HTML, script, SVG, PDF, text, an octet-stream, and any type with a
// parameter, a comma or a different spelling — is forced to a downloaded octet-stream. An exact match and
// never a prefix or family test, because a browser can read a comma-joined `Content-Type` by its LAST entry, so
// a stored `audio/x, text/html` echoed into the header renders as a document. This holds regardless of how the
// bytes were stored: several internal writers store without the signature check.
const OCTET_STREAM = "application/octet-stream";
const NOSNIFF = "nosniff";
const ATTACHMENT = "attachment";

function isInlineServable(mime: string): mime is InlineServedMime {
  return INLINE_SERVED_MIMES.some((served) => served === mime);
}

/** The `infra/storage` CAS slice the blob route reads originals from (per-user keyed). */
export interface BlobCasPort {
  readonly read: Cas["read"];
}

export interface BlobDeps {
  readonly logger: Logger;
  readonly assets: BlobAssetsPort;
  readonly cas: BlobCasPort;
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
      return await serveVariant(deps, principal, {
        hash,
        widthRaw,
        kindRaw: c.req.query("v"),
      });
    }

    return await serveOriginal(deps, principal, hash);
  });
}

/** Serve the full-size original: `getMetadata` is the ownership gate, then a direct CAS read. Missing
 *  metadata or a torn CAS entry both 404, so a foreign or missing blob reads the same as a torn one. */
async function serveOriginal(deps: BlobDeps, principal: Principal, hash: string): Promise<Response> {
  const meta = await deps.assets.getMetadata({ principal, hash });
  if (meta === undefined) {
    return new Response(null, { status: NOT_FOUND });
  }
  // meta.ownerId is set when the asset belongs to a co-participant (roster-avatar exception); on the
  // normal path it is absent and the caller IS the owner.
  const casOwnerId = meta.ownerId ?? principal.userId;
  const bytes = await readTornAsMiss(deps.logger, { ownerId: casOwnerId, hash }, () => deps.cas.read(casOwnerId, hash));
  return bytes === null ? new Response(null, { status: NOT_FOUND }) : serveBytes(bytes, meta.mime);
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

/** Serve a resized-webp variant. An off-ladder width, malformed `?v=`, non-hash, or a blob `getMetadata`
 *  refuses all resolve to `undefined` → 404. A CAS-valid-but-undecodable original (belt-passed magic bytes, corrupt
 *  body — sharp/libvips throws) degrades to the unresized original instead of a raw 500: the bytes ARE
 *  servable, just not resizable, matching the "serve what we can" spirit of the torn-blob 404 below rather
 *  than surfacing an internal decode fault to the caller. */
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
  let variant: Uint8Array | undefined;
  try {
    variant = await deps.assets.resolveVariant({ principal, hash, width, kind });
  } catch (err) {
    getLog(deps.logger).warn({ err, hash }, "blob: variant decode failed, serving original unresized");
    return serveOriginal(deps, principal, hash);
  }
  if (variant === undefined) {
    return new Response(null, { status: NOT_FOUND });
  }
  // The resolver RE-ENCODES a static original to webp but serves an ANIMATED gif/apng/webp original VERBATIM
  // (sharp's webp encoder drops animation). Sniff the bytes actually being served so an animated gif isn't
  // mislabeled `image/webp` (a still webp) — the sniffed type IS the served format on every arm. A buffer that
  // sniffs to nothing (never a real variant) falls back to the historic webp label rather than an octet-stream
  // download, preserving the "serve what we can as an image" spirit.
  const sniffed = sniffMime(variant);
  return serveBytes(variant, sniffed === OCTET_STREAM ? WEBP_MIME : sniffed);
}

function serveBytes(bytes: Uint8Array, mime: string): Response {
  // Passive media serves inline with its real type; anything else is neutralized to a downloaded
  // octet-stream so a stored user blob can never be rendered as an active same-origin document/script.
  const inline = isInlineServable(mime);
  const headers: Record<string, string> = {
    "Content-Type": inline ? mime : OCTET_STREAM,
    "Content-Length": String(bytes.byteLength),
    "Cache-Control": CACHE_CONTROL,
    // Restated here (the app middleware also sets it) so the neutralized type is honoured on every arm.
    "X-Content-Type-Options": NOSNIFF,
  };
  if (!inline) {
    headers["Content-Disposition"] = ATTACHMENT;
  }
  // Node 26 undici BodyInit requires Uint8Array<ArrayBuffer>, not Uint8Array<ArrayBufferLike>.
  // new Uint8Array(bytes) copies into a concrete ArrayBuffer view — same pattern as egress.ts.
  return new Response(new Uint8Array(bytes), { headers });
}
