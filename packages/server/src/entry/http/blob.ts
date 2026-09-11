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
import type { SessionId, UserId } from "@orb/kit/ids";
import { sniffMime } from "@orb/kit/image-sniff";
import type { Hono } from "hono";
import type { AssetMetadata } from "#domain/assets";
import { getLog } from "#foundation/observability";

const NOT_FOUND = 404;
const UNAUTHORIZED = 401;
const WEBP_MIME = "image/webp";
// Per-user cache: the response is scoped to one owner's session, immutable by content-address.
const CACHE_CONTROL = "private, immutable";
const DEFAULT_VARIANT_KIND: VariantKind = "icon";
// #709 serve-boundary neutralization. A blob is served from the app's OWN origin, so a stored HTML/JS/SVG
// asset navigated-to or `<script src=/api/blob/…>`-chained would execute with the owner's cookies: the app
// CSP's `script-src 'self'` permits the same-origin script chain and `nosniff` does not help (text/javascript
// is a real script type). So only PASSIVE MEDIA (image/video/audio) is served inline with its real type;
// everything else — HTML, script, SVG, PDF, text, an octet-stream — is forced to a downloaded octet-stream so
// it can never render as an active same-origin document. This holds regardless of how the bytes were stored
// (the upload magic belt also rejects the active classes, but a non-magic-enforced write must still be safe).
const OCTET_STREAM = "application/octet-stream";
const NOSNIFF = "nosniff";
const ATTACHMENT = "attachment";
const INLINE_MEDIA_PREFIXES = ["image/", "video/", "audio/"] as const;
// image/svg+xml carries the `image/` prefix but is a scriptable XML DOCUMENT (SVG runs `<script>`), so it is
// the one media-prefixed type that must NOT serve inline. Kept explicit rather than folded into the prefix
// test so the exception is legible at the call site.
const NEVER_INLINE_MEDIA = new Set(["image/svg+xml"]);

/** True iff the mime is passive media safe to render inline in the app's own origin (never an active
 *  document/script). The `; charset=…`/`; codecs=…` parameter is stripped before the family test. */
function isInlineServable(mime: string): boolean {
  const base = (mime.split(";")[0] ?? "").trim().toLowerCase();
  if (NEVER_INLINE_MEDIA.has(base)) {
    return false;
  }
  return INLINE_MEDIA_PREFIXES.some((prefix) => base.startsWith(prefix));
}

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

/** The request-context shape EVERY principal-reading route registrar in this directory types its `app`
 *  against — declared once here (the oldest such registrar) rather than re-spelled per route file. It is the
 *  WHOLE set of vars the auth middleware writes, not just the ones this route reads: Hono's env generic is
 *  INVARIANT, so one app instance cannot satisfy two different `Variables` shapes.
 *
 *  `sessionId` (W7a) is the cookie session that admitted the request, `null` on every other admission arm. It
 *  rides BESIDE the principal because D135 keeps the Principal to the role verdict `users` owns; its one
 *  consumer is the tRPC context, where `stream.connect` stamps it on the socket cell so a logout can evict
 *  exactly that device's streams. No route here authorizes on it. */
export interface PrincipalEnv {
  // biome-ignore lint/style/useNamingConvention: `Variables` is Hono's reserved Env key (framework-fixed name).
  Variables: { principal: Principal | null; sessionId: SessionId | null };
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
 *  metadata or a torn CAS entry both 404 — a foreign/missing blob is indistinguishable from a corrupt one. */
async function serveOriginal(deps: BlobDeps, principal: Principal, hash: string): Promise<Response> {
  const meta = await deps.assets.getMetadata({ principal, hash });
  if (meta === undefined) {
    return new Response(null, { status: NOT_FOUND });
  }
  // meta.ownerId is set when the asset belongs to a co-participant (roster-avatar exception); on the
  // normal path it is absent and the caller IS the owner.
  const casOwnerId = (meta.ownerId as UserId | undefined) ?? principal.userId;
  // @orb-waive caught-failure-ownership(catch): a LEAK-FREE COLLAPSE, stated in this function's own JSDoc — a torn CAS entry and a foreign/missing blob must return the identical 404, or the response distinguishes "exists but unreadable" from "not yours" and becomes an existence oracle. The ownership gate above already ran. Ends if torn-blob repair gains an operator surface that can be told apart from a miss.
  try {
    const bytes = await deps.cas.read(casOwnerId, hash);
    return serveBytes(bytes, meta.mime);
  } catch {
    return new Response(null, { status: NOT_FOUND });
  }
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
 *  resolve to `undefined` → 404. A CAS-valid-but-undecodable original (belt-passed magic bytes, corrupt
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
    getLog().warn({ err, hash }, "blob: variant decode failed, serving original unresized");
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
  // #709: passive media serves inline with its real type; anything else is neutralized to a downloaded
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
