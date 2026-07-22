// Tenor gif provider adapter: searchTenorGifs (v2 /search → normalized hits) + fetchTenorGifImage (import).
// SECURITY (static-vendor consumer class): both fetches ride `safeFetch` with a static `allowedHosts`
// allowlist — the search API host for /search, the `.tenor.com` media suffix for import. safeFetch's
// self-enforcing scheme pin + host allowlist + resolve→validate→pin reject a non-https / non-Tenor / IP-
// literal / private-resolving target BEFORE any socket, re-validated on every hop; import also refuses
// redirects (maxRedirects:0) and magic-validates the returned bytes (Content-Type is never trusted). The
// API key rides a query param and is never logged (host+status only).

import type { GifSearchHit, GifSearchResult } from "@orb/contracts/hub";
import type { SniffedImage } from "@orb/kit/image-sniff";
import { z } from "zod";
import { getLog } from "#foundation/observability";
import { safeFetch } from "./egress";
import { isAllowedImageBuffer } from "./image-guard";

// First-party constant — NOT user-influenced. The Tenor /search API host.
export const TENOR_API_HOST = "tenor.googleapis.com";
// Leading-dot suffix: matches any Tenor media subdomain (media.tenor.com, c.tenor.com) but never the bare
// apex or a lookalike (eviltenor.com, tenor.com.evil.net) — the safeFetch allowlist grammar (D61 §2).
export const TENOR_MEDIA_HOST_SUFFIX = ".tenor.com";
const TENOR_MEDIA_HOSTS: readonly string[] = [TENOR_MEDIA_HOST_SUFFIX];

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
const SEARCH_MAX_BYTES = 2_000_000;
// Per-gif transfer + buffer cap for import (DoS bound); isAllowedImageBuffer adds the dimension/pixel cap.
export const GIF_IMPORT_MAX_BYTES = 8_388_608; // 8 MiB
const IMPORT_CONTENT_TYPES: readonly string[] = ["image/gif", "image/webp", "image/png", "image/jpeg", "image/avif"];

export interface SearchTenorGifsArgs {
  readonly apiKey: string;
  readonly query: string;
  readonly limit: number;
  readonly cursor?: string | undefined;
}

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

// null when it lacks a usable gif format — skipped, never a throw (a malformed row must not fail the page).
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
    allowedHosts: [TENOR_API_HOST],
    maxBytes: SEARCH_MAX_BYTES,
    allowedContentTypes: ["application/json"],
  });
  if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
    res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing (F9)
    // Host + status only — never the URL (it carries the key).
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

/** The SSRF + untrusted-image chokepoint for gif import: safeFetch's `.tenor.com` allowlist rejects a
 *  non-Tenor / non-https / IP-literal host before any socket; the magic guard validates the bytes. */
export async function fetchTenorGifImage(
  url: string,
  maxBytes: number = GIF_IMPORT_MAX_BYTES,
): Promise<{ readonly bytes: Uint8Array; readonly image: SniffedImage }> {
  const res = await safeFetch(url, {
    allowedHosts: TENOR_MEDIA_HOSTS,
    maxBytes,
    maxRedirects: 0, // Tenor media URLs are direct; a redirect off-host is refused, not followed.
    allowedContentTypes: IMPORT_CONTENT_TYPES,
  });
  if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
    res.dispose?.(); // drop the non-2xx body + close the pinned Agent before throwing (F9)
    throw new Error(`gif import: fetch status ${res.status}`);
  }
  const bytes = await res.bytes();
  const image = isAllowedImageBuffer(bytes, { maxBytes });
  return { bytes, image };
}
