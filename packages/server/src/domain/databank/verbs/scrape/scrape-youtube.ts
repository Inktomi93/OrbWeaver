// verb: scrapeYoutube (DB8) — fetch a video's timedtext caption track over the SAME ANY_HOST safeFetch guard as
// scrapeWeb, join the caption cues to plain text, then the §2 canon tail (`substrate/scrape-canon`)
// (databank-design/06 §5). No API key: `https://www.youtube.com/api/timedtext?v=<id>&lang=<lang>` returns the
// caption XML (`<text start=… dur=…>cue</text>` cues). We derive the 11-char video id from a watch/short/embed URL
// (or a bare id), decode the cue text, and join cues with `\n` — the caption text is the canon, mime 'text/plain'.
// databank adds ZERO fetch guard logic: a refused/failed fetch (the op throws) collapses to ONE leak-free
// `ScrapeFailedError` (BAD_REQUEST), never retry-looped. A video with no caption track fetches to empty XML → an
// empty cue set → the same `ScrapeFailedError` (there is nothing to ingest — a caption-less video is not canon).
// Stamps: origin 'youtube', sourceUrl = the canonical watch URL, name = the video id (timedtext carries no title).

import { ScrapeFailedError } from "../../contract/errors.ts";
import type { ScrapeYoutubeParams } from "../../contract/params.ts";
import type { UploadResult } from "../../contract/results.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { finalizeScrape } from "../../substrate/scrape-canon.ts";

const PLAIN_MIME = "text/plain";
const TIMEDTEXT_ORIGIN = "https://www.youtube.com/api/timedtext";
const WATCH_URL = "https://www.youtube.com/watch?v=";
// A youtube video id is exactly 11 URL-safe base64 chars.
const VIDEO_ID = /^[\w-]{11}$/;
/** A leading `www.`/`m.` on the host (stripped before the host switch). */
const HOST_PREFIX = /^(?:www\.|m\.)/;
/** The youtube watch/embed/shorts hosts (`youtu.be` short-links are handled separately). A non-youtube host
 *  never yields an id — an arbitrary `example.com/<11 chars>` must NOT be mistaken for a video. */
const YOUTUBE_HOSTS = new Set(["youtube.com", "youtube-nocookie.com"]);
/** A caption cue: `<text start="1.2" dur="3.4">the words</text>` (attribute order/extra attrs vary). */
const CUE = /<text\b[^>]*>([\s\S]*?)<\/text>/g;
const XML_ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos|#39);/g;

function decodeXml(raw: string): string {
  return raw.replace(XML_ENTITY, (m) => XML_ENTITIES[m] ?? m);
}

/** The 11-char video id from a watch/short/embed/youtu.be URL, or a bare id. `undefined` when none is present
 *  (the verb collapses that to `ScrapeFailedError` — a leak-free BAD_REQUEST, the caller's URL is at fault). */
function videoIdFrom(input: string): string | undefined {
  if (VIDEO_ID.test(input)) {
    return input;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return;
  }
  const host = url.hostname.replace(HOST_PREFIX, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return VIDEO_ID.test(id) ? id : undefined;
  }
  if (!YOUTUBE_HOSTS.has(host)) {
    return; // a non-youtube host never yields a video id
  }
  const fromQuery = url.searchParams.get("v");
  if (fromQuery !== null && VIDEO_ID.test(fromQuery)) {
    return fromQuery;
  }
  // /shorts/<id> and /embed/<id> carry the id as the last path segment.
  const last = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  return VIDEO_ID.test(last) ? last : undefined;
}

/** Join the caption cues to plain text (one cue per line, entities decoded). Empty when no cues parse. */
function captionsToText(xml: string): string {
  const cues: string[] = [];
  for (const match of xml.matchAll(CUE)) {
    const line = decodeXml(match[1] ?? "").trim();
    if (line.length > 0) {
      cues.push(line);
    }
  }
  return cues.join("\n");
}

export function createScrapeYoutube(ctx: DatabankContext): DatabankService["scrapeYoutube"] {
  return async ({ principal, url, lang }: ScrapeYoutubeParams): Promise<UploadResult> => {
    const videoId = videoIdFrom(url);
    if (videoId === undefined) {
      throw new ScrapeFailedError();
    }
    const captionUrl = `${TIMEDTEXT_ORIGIN}?v=${videoId}&lang=${encodeURIComponent(lang)}`;

    let bytes: Uint8Array;
    try {
      bytes = await ctx.fetchUrl(captionUrl);
    } catch (err) {
      // biome-ignore lint/style/useErrorCause: the cause IS forwarded — ScrapeFailedError assigns options.cause; biome can't see through the custom class (the scrapeWeb precedent).
      throw new ScrapeFailedError({ cause: err });
    }

    const text = captionsToText(new TextDecoder("utf-8").decode(bytes));
    if (text.length === 0) {
      throw new ScrapeFailedError(); // no caption track — nothing to ingest (a caption-less video is not canon)
    }

    return finalizeScrape(ctx, {
      principal,
      bytes: new TextEncoder().encode(text),
      origin: "youtube",
      mime: PLAIN_MIME,
      name: { literal: videoId },
      sourceUrl: `${WATCH_URL}${videoId}`,
      auditAction: "databank.scrapeYoutube",
    });
  };
}
