// verb: scrapeWiki (DB8) — fetch a MediaWiki article's plain-text extract over the compose-bound ANY_HOST
// safeFetch guard (endpoint derived from the article host), then the SAME §2 canon tail (databank-design/06 §5).
// The fetch rides a STUBBED `fetchUrl` op (no live network). Load-bearing:
//   · the round-trip: API JSON → CAS blob + documents row stamped origin 'wiki'/article-URL/'text/plain' → ingest QUEUED
//   · the API endpoint is derived from the article URL's OWN host (any MediaWiki host — Wikipedia, Fandom, self-hosted)
//   · the article title is parsed from /wiki/<Title> (underscores → spaces) and the name comes from the API's title
//   · a missing article (empty extract / unexpected shape) collapses to ScrapeFailedError — no row, no enqueue
//   · a fetch refusal collapses to a leak-free ScrapeFailedError, NOT retry-looped
// The SSRF belt ITSELF is proven in tests/server/infra/network/egress.test.ts; this asserts only the pass-through.

import { documents } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createExtractText, EXTRACTOR_VERSION } from "@orb/server/infra/extraction";
import { eq } from "drizzle-orm";
import { ScrapeFailedError } from "../../../../../../packages/server/src/domain/databank/contract/errors.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

const ARTICLE_URL = "https://en.wikipedia.org/wiki/Northern_Passes";
const API_URL = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=Northern%20Passes";
const EXTRACT_JSON = JSON.stringify({
  query: { pages: { "42": { pageid: 42, title: "Northern Passes", extract: "The Northern Passes are a mountain range guarded by toll keepers." } } },
});
const MISSING_JSON = JSON.stringify({ query: { pages: { "-1": { title: "Northern Passes", missing: "" } } } });

function bytesOf(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function makeHarness(db: Parameters<typeof makeDatabankHarness>[0]): ReturnType<typeof makeDatabankHarness> {
  return makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
}

test("scrapes an article: derives the API endpoint from the host, stamps 'wiki' canon, enqueues ingest", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf(EXTRACT_JSON));

  const result = await h.service.scrapeWiki({ principal: principalFor(owner), url: ARTICLE_URL });

  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  expect(result.document.origin).toBe("wiki");
  expect(result.document.sourceUrl).toBe(ARTICLE_URL);
  expect(result.document.mime).toBe("text/plain");
  expect(result.document.name).toBe("Northern Passes"); // the API's canonical title

  expect(h.fetchUrl).toHaveBeenCalledTimes(1);
  expect(h.fetchUrl).toHaveBeenCalledWith(API_URL); // endpoint derived from the article host + parsed title

  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows[0]?.origin).toBe("wiki");
  expect(rows[0]?.extractedText).toContain("guarded by toll keepers");
});

test("derives the endpoint from a NON-Wikipedia MediaWiki host (Fandom rides the same verb)", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf(EXTRACT_JSON));

  await h.service.scrapeWiki({ principal: principalFor(owner), url: "https://elderscrolls.fandom.com/wiki/Skyrim" });
  expect(h.fetchUrl).toHaveBeenCalledWith(
    "https://elderscrolls.fandom.com/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=Skyrim",
  );
});

test("a missing article (no extract) collapses to ScrapeFailedError — no row, no enqueue", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf(MISSING_JSON));

  await expect(h.service.scrapeWiki({ principal: principalFor(owner), url: ARTICLE_URL })).rejects.toBeInstanceOf(ScrapeFailedError);
  expect(h.assetsStore).not.toHaveBeenCalled();
  expect(h.enqueueIngest).not.toHaveBeenCalled();
  const rows = await db.select().from(documents).where(eq(documents.ownerId, owner));
  expect(rows).toHaveLength(0);
});

test("malformed JSON collapses to ScrapeFailedError", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf("<html>not json — a captcha wall</html>"));

  await expect(h.service.scrapeWiki({ principal: principalFor(owner), url: ARTICLE_URL })).rejects.toBeInstanceOf(ScrapeFailedError);
  expect(h.enqueueIngest).not.toHaveBeenCalled();
});

test("a fetch refusal collapses to a leak-free ScrapeFailedError, not retry-looped", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockRejectedValueOnce(new Error("SSRF_BLOCKED: 169.254.169.254"));

  const error = await h.service.scrapeWiki({ principal: principalFor(owner), url: ARTICLE_URL }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ScrapeFailedError);
  expect((error as ScrapeFailedError).message).not.toContain("169.254.169.254");
  expect(h.fetchUrl).toHaveBeenCalledTimes(1);
});
