// verb: scrapeWeb — fetch a web page over the self-enforcing safeFetch egress guard, then the SAME §2 canon tail
// as upload (`substrate/scrape-canon`: importHash → CAS → documents row → enqueue ingest).
// databank adds ZERO SSRF guard logic: `ctx.fetchUrl` is the compose-bound ANY_HOST safeFetch port — https-only,
// private-range denial, per-hop re-validation all ride the injected op. A refused OR failed fetch (the op throws)
// collapses to ONE leak-free `ScrapeFailedError` (BAD_REQUEST) — the reason + any resolved private address stay
// server-side (never a client SSRF oracle), and it is NEVER retry-looped. The fetched html rides the SAME
// injected `extractText` op the upload path uses (mime 'text/html' → the DB3 html loader), so there is no second
// html-to-text path. Stamps: origin 'web', sourceUrl = the requested URL, name = the page `<title>` (fallback:
// hostname+path), mime 'text/html'. A re-scrape of a CHANGED page = a new importHash = a NEW document (canon like
// any upload; the old one stays until removed — no in-place overwrite of canon another chat may have retrieved).

import { ScrapeFailedError } from "../../contract/errors.ts";
import type { ScrapeWebParams } from "../../contract/params.ts";
import type { UploadResult } from "../../contract/results.ts";
import type { DatabankContext, DatabankService } from "../../contract/service.ts";
import { finalizeScrape } from "../../substrate/scrape-canon.ts";

const HTML_MIME = "text/html";
/** #709 refuses `text/html` as a STORED asset (stored-XSS). The fetched page is UTF-8 text, so the blob is
 *  stored as plain text — magic-verified as UTF-8, served as an attachment like every non-media asset — while
 *  `documents.mime` stays `text/html` so the html loader still runs on every re-extraction. */
const STORE_MIME = "text/plain";

/** The hostname+path name fallback when a page carries no usable `<title>`. */
function fallbackName(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname === "/" ? "" : parsed.pathname;
  return `${parsed.hostname}${path}`;
}

export function createScrapeWeb(ctx: DatabankContext): DatabankService["scrapeWeb"] {
  return async ({ principal, url }: ScrapeWebParams): Promise<UploadResult> => {
    let bytes: Uint8Array;
    try {
      bytes = await ctx.fetchUrl(url);
    } catch (err) {
      // biome-ignore lint/style/useErrorCause: the cause IS forwarded — ScrapeFailedError assigns options.cause; biome can't see through the custom class (the egress.ts EgressBlockedError precedent).
      throw new ScrapeFailedError({ cause: err });
    }

    return finalizeScrape(ctx, {
      principal,
      bytes,
      origin: "web",
      mime: HTML_MIME,
      storeMime: STORE_MIME,
      name: { titleFallback: fallbackName(url) },
      sourceUrl: url,
      auditAction: "databank.scrapeWeb",
    });
  };
}
