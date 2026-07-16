// Tenor gif provider adapter: searchTenorGifs (v2 /search → normalized hits) + fetchTenorGifImage (import).
// SECURITY: the import url is provider-echoed (attacker-influenceable) and is fail-closed host-gated
// against the Tenor media allowlist before any fetch, with redirects disallowed and the returned bytes
// magic-validated (Content-Type is never trusted). The API key is never logged (host+status only).

import type { GifSearchHit, GifSearchResult } from "@orb/contracts/hub";
import type { SniffedImage } from "@orb/kit/image-sniff";
import { z } from "zod";
import { getLog } from "#foundation/observability";
import { safeFetch } from "./egress";
import { isAllowedImageBuffer } from "./image-guard";

// First-party constant — NOT user-influenced.
export const TENOR_API_HOST = "tenor.googleapis.com";
// Leading-dot suffix matches any subdomain but never the bare apex or a lookalike (eviltenor.com).
export const TENOR_MEDIA_HOST_SUFFIX = ".tenor.com";
const TENOR_APEX = "tenor.com";

const OK_STATUS_MIN = 200;
const OK_STATUS_MAX = 300;
const SEARCH_MAX_BYTES = 2_000_000;
// Per-gif transfer + buffer cap for import (DoS bound); isAllowedImageBuffer adds the dimension/pixel cap.
export const GIF_IMPORT_MAX_BYTES = 8_388_608; // 8 MiB
const IMPORT_CONTENT_TYPES: readonly string[] = ["image/gif", "image/webp", "image/png", "image/jpeg", "image/avif"];

const TRAILING_DOT_RE = /\.$/;

// Anchored suffix check so eviltenor.com / tenor.com.evil.net do NOT match.
export function isTenorMediaHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(TRAILING_DOT_RE, "");
  return host === TENOR_APEX || host.endsWith(TENOR_MEDIA_HOST_SUFFIX);
}

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
    maxBytes: SEARCH_MAX_BYTES,
    allowedContentTypes: ["application/json"],
  });
  if (res.status < OK_STATUS_MIN || res.status >= OK_STATUS_MAX) {
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

/** The SSRF + untrusted-image chokepoint for gif import. */
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
