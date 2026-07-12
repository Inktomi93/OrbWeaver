// infra/network/gif-search — the Tenor gif provider adapter (D61 gallery-design §5; the ONE place that
// knows Tenor's URL grammar + response shape). Two ops the `domain/hub` gif verbs inject (the
// domain-verb-over-injected-network-adapter pattern, `credentials.fetchModels` precedent):
//   • searchTenorGifs   — GET the Tenor v2 /search catalog → normalized `GifSearchHit[]` (+ opaque cursor).
//   • fetchTenorGifImage — download ONE gif's bytes for import, host-gated + magic-validated.
//
// SECURITY — this file is the egress + SSRF chokepoint for gif search/import:
//   • SEARCH host is a FIRST-PARTY constant (`tenor.googleapis.com`) — only the query TEXT is user input
//     (a query param, never the host), so search has no host-steering SSRF surface. It still rides
//     `safeFetch` (response byte cap · content-type gate) as defense-in-depth.
//   • IMPORT url is provider-authored (a Tenor `fullUrl` echoed back by the client), therefore
//     attacker-influenceable. It is FAIL-CLOSED host-gated against the Tenor media-host allowlist BEFORE any
//     fetch (`isTenorMediaHost`): the client can NOT steer the fetch off Tenor. `.tenor.com` is
//     Google-owned, so an attacker cannot mint a `*.tenor.com` name resolving to a private/internal IP —
//     the suffix allowlist is a real internal-SSRF barrier that does NOT depend on the opt-in global egress
//     firewall. Redirects are DISALLOWED (`maxRedirects: 0`): Tenor media URLs are direct byte responses, and
//     the as-built `safeFetch` does not re-validate the host allowlist per redirect hop (hub-browse-design/01
//     S6), so a redirect off-host is refused rather than blindly followed. The returned bytes are then
//     magic-validated + dimension-capped by `isAllowedImageBuffer` — the remote Content-Type is never
//     trusted (the 200-status HTML-error-page-served-as-image classic).
//   • The API KEY is NEVER logged: the search URL carries the key as a query param, so failures log only the
//     host + status, NEVER the URL/query/key.

import type { GifSearchHit, GifSearchResult } from "@orb/contracts/hub";
import type { SniffedImage } from "@orb/kit/image-sniff";
import { z } from "zod";
import { getLog } from "#foundation/observability";
import { safeFetch } from "./egress";
import { isAllowedImageBuffer } from "./image-guard";

/** The Tenor v2 search API host (first-party constant — NOT user-influenced). */
export const TENOR_API_HOST = "tenor.googleapis.com";
/** Tenor's media/CDN host suffix. A leading-dot suffix matches any subdomain (`media.tenor.com`,
 *  `c.tenor.com`, `media1.tenor.com`) but NEVER the bare apex or a lookalike (`eviltenor.com`). */
export const TENOR_MEDIA_HOST_SUFFIX = ".tenor.com";
const TENOR_APEX = "tenor.com";

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
// The Tenor /search JSON is small; a tight cap so a coaxed/compromised endpoint can't stream a large body.
const SEARCH_MAX_BYTES = 2_000_000;
// Per-gif transfer + buffer cap for import (DoS bound on one gif). Tenor gifs are well under this; the
// dimension/pixel caps in `isAllowedImageBuffer` add the decompression-bomb defense on top.
export const GIF_IMPORT_MAX_BYTES = 8_388_608; // 8 MiB
// Cheap pre-filter: a 200 HTML error page (text/html) is rejected before its body is read. The REAL gate
// is the magic-byte sniff below (a header can lie), but this drops the obvious case early.
const IMPORT_CONTENT_TYPES: readonly string[] = [
  "image/gif",
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/avif",
];

/** Strip one trailing FQDN dot (hoisted — useTopLevelRegex). */
const TRAILING_DOT_RE = /\.$/;

/**
 * Is `hostname` a Tenor media host? Case-insensitive; exact apex (`tenor.com`) OR a `.tenor.com` subdomain.
 * The suffix check is anchored (`endsWith`) so `eviltenor.com` / `tenor.com.evil.net` do NOT match. IP-literal
 * hosts never match (they carry no dot-suffix that ends in `.tenor.com`). Exported for the adapter test.
 */
export function isTenorMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(TRAILING_DOT_RE, "");
  return host === TENOR_APEX || host.endsWith(TENOR_MEDIA_HOST_SUFFIX);
}

/** Args for `searchTenorGifs`, the op `domain/hub/verbs/gifs` injects. `apiKey` is the resolved Tenor key. */
export interface SearchTenorGifsArgs {
  readonly apiKey: string;
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string | undefined;
}

// One Tenor media format entry (`url` + `dims:[w,h]`). `.loose()` tolerates the other fields Tenor sends.
const tenorFormatSchema = z
  .object({
    url: z.string(),
    dims: z.array(z.number()).optional(),
  })
  .loose();

const tenorResultSchema = z
  .object({
    id: z.string(),
    // biome-ignore lint/style/useNamingConvention: Tenor v2 API wire field (snake_case) — the external response shape, not ours to rename.
    media_formats: z.record(z.string(), tenorFormatSchema).optional(),
  })
  .loose();

const tenorResponseSchema = z.object({
  results: z.array(tenorResultSchema).optional(),
  next: z.string().optional(),
});

type TenorResult = z.infer<typeof tenorResultSchema>;

/** Map one Tenor result → a normalized `GifSearchHit`, or `null` when it lacks a usable gif format (skipped,
 *  never a throw — a malformed row must not fail the whole page). `tinygif` is the small preview, `gif` the
 *  full import target; dims come off the full format. */
function toHit(result: TenorResult): GifSearchHit | null {
  const formats = result.media_formats;
  if (formats === undefined) {
    return null;
  }
  const full = formats["gif"] ?? formats["mediumgif"];
  const preview = formats["tinygif"] ?? formats["nanogif"] ?? full;
  if (full === undefined || preview === undefined) {
    return null;
  }
  // `.at()` is `number | undefined` under BOTH tsc (noUncheckedIndexedAccess) and biome — so the
  // undefined guard is honest to both tools (a bracket-index tripped biome's noUnnecessaryConditions).
  const width = full.dims?.at(0);
  const height = full.dims?.at(1);
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    return null;
  }
  return {
    id: result.id,
    previewUrl: preview.url,
    fullUrl: full.url,
    width,
    height,
  };
}

/**
 * GET the Tenor v2 `/search` catalog → normalized hits. Best-effort mapping (a malformed result is skipped);
 * throws only on a hard transport/parse failure the verb surfaces as `hub-unavailable`. The key rides as the
 * `key` query param — NEVER logged (failures log host + status only).
 */
export async function searchTenorGifs(args: SearchTenorGifsArgs): Promise<GifSearchResult> {
  const url = new URL(`https://${TENOR_API_HOST}/v2/search`);
  url.searchParams.set("q", args.query);
  url.searchParams.set("key", args.apiKey);
  url.searchParams.set("limit", String(args.limit));
  url.searchParams.set("media_filter", "gif,tinygif,nanogif");
  if (args.cursor !== undefined && args.cursor.length > 0) {
    url.searchParams.set("pos", args.cursor);
  }
  const res = await safeFetch(url, {
    maxBytes: SEARCH_MAX_BYTES,
    allowedContentTypes: ["application/json"],
  });
  if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
    // Host + status only — NEVER the URL (it carries the key).
    getLog().info({ host: TENOR_API_HOST, status: res.status }, "network: tenor /search non-2xx");
    throw new Error(`tenor search failed: status ${res.status}`);
  }
  const text = new TextDecoder().decode(await res.bytes());
  const parsed = tenorResponseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error("tenor search: unexpected response shape");
  }
  const hits: GifSearchHit[] = [];
  for (const result of parsed.data.results ?? []) {
    const hit = toHit(result);
    if (hit !== null) {
      hits.push(hit);
    }
  }
  const nextCursor = parsed.data.next;
  return nextCursor !== undefined && nextCursor.length > 0 ? { hits, nextCursor } : { hits };
}

/**
 * Download ONE gif's bytes for import — the SSRF + untrusted-image chokepoint. FAIL-CLOSED: rejects any host
 * outside the Tenor media allowlist before fetching, disallows redirects, caps transfer bytes, and
 * magic-validates + dimension-caps the returned bytes (`isAllowedImageBuffer`, never trusting Content-Type).
 * Throws `EgressBlockedError`-style `Error` on a bad host / non-2xx, or `ImageRejectedError` on a bad buffer;
 * the verb maps these to the leak-free import failure.
 */
export async function fetchTenorGifImage(
  url: string,
  maxBytes: number = GIF_IMPORT_MAX_BYTES,
): Promise<{ readonly bytes: Uint8Array; readonly image: SniffedImage }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !isTenorMediaHost(parsed.hostname)) {
    // Host allowlist is the SSRF barrier — reject BEFORE any network call.
    throw new Error(`gif import: url host ${parsed.hostname} is not a Tenor media host`);
  }
  const res = await safeFetch(parsed, {
    maxBytes,
    maxRedirects: 0, // Tenor media URLs are direct; a redirect off-host is not re-host-validated → refuse.
    allowedContentTypes: IMPORT_CONTENT_TYPES,
  });
  if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
    throw new Error(`gif import: fetch status ${res.status}`);
  }
  const bytes = await res.bytes();
  const image = isAllowedImageBuffer(bytes, { maxBytes });
  return { bytes, image };
}
