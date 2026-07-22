// verb: scrapeWiki (DB8) — fetch a MediaWiki article's plain-text extract over the SAME ANY_HOST safeFetch guard
// as scrapeWeb, then the §2 canon tail (`substrate/scrape-canon`) (databank-design/06 §5). The API endpoint is
// DERIVED from the article URL's own host (`https://<host>/w/api.php`), so any MediaWiki wiki — Wikipedia, a
// Fandom host, a self-hosted wiki — rides one verb (the ST `fandom` scraper is a MediaWiki host, doc 06 §5). The
// query is `action=query&prop=extracts&explaintext&titles=<Article>&format=json`: MediaWiki returns the article
// body as PLAIN TEXT (no html loader needed — passthrough), so mime 'text/plain'. databank adds ZERO fetch guard
// logic: a refused/failed fetch (the op throws) collapses to ONE leak-free `ScrapeFailedError` (BAD_REQUEST),
// never retry-looped; a malformed/absent-article response (no extract) collapses the same way. Stamps: origin
// 'wiki', sourceUrl = the requested article URL, name = the article title from the API (fallback: the URL title).

import { ScrapeFailedError } from "../../contract/errors";
import type { ScrapeWikiParams } from "../../contract/params";
import type { UploadResult } from "../../contract/results";
import type { DatabankContext, DatabankService } from "../../contract/service";
import { finalizeScrape } from "../../substrate/scrape-canon";

const PLAIN_MIME = "text/plain";
/** The `/wiki/<Article_Title>` article-path capture. */
const WIKI_PATH = /\/wiki\/(.+)$/;
/** MediaWiki title underscores → display-form spaces. */
const UNDERSCORE = /_/g;

/** The `/wiki/<Article_Title>` article title from a MediaWiki URL, else the last path segment (a `?title=`
 *  index.php URL). Underscores → spaces (MediaWiki's canonical display form); percent-decoded. */
function articleTitle(url: URL): string {
  const fromQuery = url.searchParams.get("title");
  const wikiMatch = WIKI_PATH.exec(url.pathname);
  const raw = fromQuery ?? wikiMatch?.[1] ?? url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  return decodeURIComponent(raw).replace(UNDERSCORE, " ");
}

/** The MediaWiki plain-text extract from a `prop=extracts&explaintext` response. Returns the `{ extract, title }`
 *  of the first (non-missing) page, or `undefined` when the article is missing / the shape is unexpected. */
function parseExtract(json: unknown): { readonly text: string; readonly title: string } | undefined {
  const pages = (json as { query?: { pages?: unknown } } | null)?.query?.pages;
  const rows = typeof pages === "object" && pages !== null ? Object.values(pages as Record<string, unknown>) : [];
  const hit = rows.find((page): page is { extract: string; title: string } => {
    const extract = (page as { extract?: unknown } | null)?.extract;
    const title = (page as { title?: unknown } | null)?.title;
    return typeof extract === "string" && extract.length > 0 && typeof title === "string";
  });
  return hit === undefined ? undefined : { text: hit.extract, title: hit.title };
}

export function createScrapeWiki(ctx: DatabankContext): DatabankService["scrapeWiki"] {
  return async ({ principal, url }: ScrapeWikiParams): Promise<UploadResult> => {
    // `url` is a validated `z.url()` from the tRPC seam (the scrapeWeb precedent trusts it the same way).
    const parsed = new URL(url);
    const title = articleTitle(parsed);
    if (title.length === 0) {
      throw new ScrapeFailedError();
    }
    const apiUrl = `${parsed.origin}/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=${encodeURIComponent(title)}`;

    let bytes: Uint8Array;
    try {
      bytes = await ctx.fetchUrl(apiUrl);
    } catch (err) {
      // biome-ignore lint/style/useErrorCause: the cause IS forwarded — ScrapeFailedError assigns options.cause; biome can't see through the custom class (the scrapeWeb precedent).
      throw new ScrapeFailedError({ cause: err });
    }

    let extract: ReturnType<typeof parseExtract>;
    try {
      extract = parseExtract(JSON.parse(new TextDecoder("utf-8").decode(bytes)));
    } catch (err) {
      // biome-ignore lint/style/useErrorCause: the JSON parse cause is forwarded onto ScrapeFailedError (same custom-class limitation biome can't see through).
      throw new ScrapeFailedError({ cause: err });
    }
    if (extract === undefined) {
      throw new ScrapeFailedError(); // a missing article / unexpected shape — nothing to ingest
    }

    return finalizeScrape(ctx, {
      principal,
      bytes: new TextEncoder().encode(extract.text),
      origin: "wiki",
      mime: PLAIN_MIME,
      name: { literal: extract.title },
      sourceUrl: url,
      auditAction: "databank.scrapeWiki",
    });
  };
}
