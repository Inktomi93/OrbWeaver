// verb: scrapeWeb (DB7) — fetch a web page over the compose-bound ANY_HOST safeFetch guard, extract its html,
// then the SAME §2 canon pipeline as upload (databank-design/06 §5). The fetch rides a STUBBED `fetchUrl` op (no
// live network — the harness mock returns canned bytes or rejects). Load-bearing:
//   · the round-trip: fetched html → CAS blob + documents row stamped origin 'web'/sourceUrl/mime → ingest QUEUED
//   · the name derives from the page <title>, with a hostname+path FALLBACK when there is none
//   · the SSRF/fetch-refusal PASS-THROUGH: the op throwing (EgressBlockedError in prod) collapses to a leak-free
//     ScrapeFailedError — NO row, NO CAS write, NO enqueue, and it is NEVER retried (asserted: one op call)
//   · re-scrape of identical bytes dedups on (ownerId, importHash) — duplicate/skipped, no second enqueue
// The SSRF belt ITSELF is proven in tests/server/infra/network/egress.test.ts; databank asserts only the
// pass-through (the DB7 checkpoint, doc 08 §1).

import { documents } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import type { DatabankContext } from "@orb/server/domain/databank";
import { createDatabankService, ScrapeFailedError } from "@orb/server/domain/databank";
import { createExtractText, EXTRACTOR_VERSION } from "@orb/server/infra/extraction";
import { eq } from "drizzle-orm";
import { onTestFinished } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeHarness as makeAssetsHarness } from "../../../assets/_support.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

const URL_WITH_TITLE = "https://example.com/wiki/Northern_Passes";
const HTML_WITH_TITLE =
  "<!doctype html><html><head><title>The Northern Passes</title></head><body><h1>Passes</h1><p>A guide to the toll keepers.</p></body></html>";

const URL_NO_TITLE = "https://docs.example.org/guide/toll";
const HTML_NO_TITLE = "<html><body><p>No title here — just body copy.</p></body></html>";

function bytesOf(html: string): Uint8Array {
  return new TextEncoder().encode(html);
}

test("scrapes a page: fetches over the guard, extracts html, stamps 'web' canon, enqueues ingest", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf(HTML_WITH_TITLE));

  const result = await h.service.scrapeWeb({ principal: principalFor(owner), url: URL_WITH_TITLE });

  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  expect(result.document.origin).toBe("web");
  expect(result.document.sourceUrl).toBe(URL_WITH_TITLE);
  expect(result.document.mime).toBe("text/html");
  expect(result.document.name).toBe("The Northern Passes"); // the page <title>

  // The verb delegated to the injected guard (the pass-through), exactly once, with the caller's url.
  expect(h.fetchUrl).toHaveBeenCalledTimes(1);
  expect(h.fetchUrl).toHaveBeenCalledWith(URL_WITH_TITLE);

  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ ownerId: owner, origin: "web", sourceUrl: URL_WITH_TITLE, mime: "text/html", extractorVersion: EXTRACTOR_VERSION });
  expect(rows[0]?.sourceAssetId).not.toBeNull(); // the html bytes were CAS-stored (re-extract provenance)
  expect(rows[0]?.extractedText).toContain("A guide to the toll keepers.");
  expect(h.assetsStore).toHaveBeenCalledTimes(1);
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1);
  expect(h.enqueueIngest).toHaveBeenCalledWith({ documentId: result.document.id, ownerId: owner });
});

test("a page with no <title> falls back to hostname+path for the name", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf(HTML_NO_TITLE));

  const result = await h.service.scrapeWeb({ principal: principalFor(owner), url: URL_NO_TITLE });
  expect(result.document.name).toBe("docs.example.org/guide/toll");
});

test("a re-scrape of identical bytes dedups (duplicate/skipped, no second enqueue)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValue(bytesOf(HTML_WITH_TITLE)); // both scrapes fetch the same bytes

  const first = await h.service.scrapeWeb({ principal: principalFor(owner), url: URL_WITH_TITLE });
  const second = await h.service.scrapeWeb({ principal: principalFor(owner), url: URL_WITH_TITLE });

  expect(second.outcome).toBe("duplicate");
  expect(second.ingest).toBe("skipped");
  expect(second.document.id).toBe(first.document.id); // the existing document is returned
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1); // only the first enqueued
  const rows = await db.select().from(documents).where(eq(documents.ownerId, owner));
  expect(rows).toHaveLength(1);
});

test("an SSRF-refused fetch collapses to ScrapeFailedError — no row, no CAS write, no enqueue, not retried", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  // In prod this is safeFetch's EgressBlockedError (a private-range redirect / non-https / ip-literal target).
  h.fetchUrl.mockRejectedValueOnce(new Error("SSRF_BLOCKED: internal.corp → 10.0.0.5"));

  await expect(h.service.scrapeWeb({ principal: principalFor(owner), url: "https://internal.corp/" })).rejects.toBeInstanceOf(ScrapeFailedError);

  expect(h.fetchUrl).toHaveBeenCalledTimes(1); // NOT retry-looped
  expect(h.assetsStore).not.toHaveBeenCalled();
  expect(h.enqueueIngest).not.toHaveBeenCalled();
  const rows = await db.select().from(documents).where(eq(documents.ownerId, owner));
  expect(rows).toHaveLength(0);
});

test("the leak-free ScrapeFailedError never surfaces the resolved private address (no SSRF oracle)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockRejectedValueOnce(new Error("SSRF_BLOCKED: internal.corp → 169.254.169.254"));

  const error = await h.service.scrapeWeb({ principal: principalFor(owner), url: "https://internal.corp/" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ScrapeFailedError);
  expect((error as ScrapeFailedError).message).toBe("The web page could not be scraped.");
  expect((error as ScrapeFailedError).message).not.toContain("169.254.169.254"); // the address stays server-side
});

test("a fetch failure (non-2xx / network) also collapses to ScrapeFailedError with no canon written", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockRejectedValueOnce(new Error("scrape fetch failed: HTTP 404"));

  await expect(h.service.scrapeWeb({ principal: principalFor(owner), url: "https://example.com/missing" })).rejects.toBeInstanceOf(ScrapeFailedError);
  expect(h.enqueueIngest).not.toHaveBeenCalled();
});

test("an html page that extracts to empty surfaces the empty-extraction warning (not a throw)", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.fetchUrl.mockResolvedValueOnce(bytesOf("<html><head><title>Empty</title></head><body></body></html>"));

  const result = await h.service.scrapeWeb({ principal: principalFor(owner), url: "https://example.com/empty" });
  expect(result.outcome).toBe("created");
  expect(result.warning).toBe("empty-extraction");
  expect(h.enqueueIngest).toHaveBeenCalledTimes(1); // still queued — the empty doc is canon
});

// DBK-A landed (assets/substrate/mime.ts — the strict-UTF-8 text/* arm): a real text/html scrape now passes the
// enforceMagic belt end-to-end. This drives scrapeWeb through the REAL `assets.store` (real CAS + the sniff belt,
// no faked store) with html bytes, mirroring the upload lane's real-store proof.
test("a real html scrape stores end-to-end through the REAL assets.store belt (no faked store)", async () => {
  const db = await freshDb();
  const assetsH = await makeAssetsHarness(db);
  onTestFinished(assetsH.cleanup);
  const assets = createAssetsService(assetsH.ctx);
  const base = makeDatabankHarness(db, {
    fetchUrl: () => Promise.resolve(bytesOf(HTML_WITH_TITLE)),
    extractor: { op: createExtractText(), version: EXTRACTOR_VERSION },
  });
  const ctx: DatabankContext = { ...base.ctx, assetsStore: assets.store };
  const service = createDatabankService(ctx);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const result = await service.scrapeWeb({ principal: principalFor(owner), url: URL_WITH_TITLE });

  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows[0]?.origin).toBe("web");
  expect(rows[0]?.mime).toBe("text/html");
  // The sourceAssetId FK resolves to a REAL assets row the strict-UTF-8 belt admitted (valid-UTF-8 html).
  expect(rows[0]?.sourceAssetId).not.toBeNull();
  expect(rows[0]?.extractedText).toContain("A guide to the toll keepers.");
});
