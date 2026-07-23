// verb: scrapeYoutube (DB8) — fetch a video's timedtext caption track over the compose-bound ANY_HOST safeFetch
// guard, join the cues to plain text, then the SAME §2 canon tail as upload/scrapeWeb (databank-design/06 §5).
// The fetch rides a STUBBED `fetchUrl` op (no live network). Load-bearing:
//   · the round-trip: caption XML → CAS blob + documents row stamped origin 'youtube'/watch-URL/'text/plain' → ingest QUEUED
//   · the video id is derived from a watch/youtu.be/shorts URL (or bare id) and the timedtext endpoint is built from it + lang
//   · a video with NO caption track (empty XML) collapses to ScrapeFailedError — no row, no CAS, no enqueue
//   · a fetch refusal (EgressBlockedError in prod) collapses to a leak-free ScrapeFailedError, NOT retry-looped
// The SSRF belt ITSELF is proven in tests/server/infra/network/egress.test.ts; this asserts only the pass-through.

import { documents } from "@orb/db";
import { createExtractText, EXTRACTOR_VERSION } from "@orb/server/infra/extraction";
import { eq } from "drizzle-orm";
import { ScrapeFailedError } from "../../../../../../packages/server/src/domain/databank/contract/errors.ts";
import { freshDb } from "../../../../../support/db.ts";
import { expect, test } from "../../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../../_support.ts";

const VIDEO_ID = "dQw4w9WgXcQ";
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const CAPTIONS_XML =
  '<?xml version="1.0"?><transcript><text start="0" dur="2">Never gonna give you up</text><text start="2" dur="2">Never gonna let you down</text></transcript>';

function bytesOf(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function makeHarness(db: Parameters<typeof makeDatabankHarness>[0]): ReturnType<typeof makeDatabankHarness> {
  return makeDatabankHarness(db, { extractor: { op: createExtractText(), version: EXTRACTOR_VERSION } });
}

test("scrapes captions: derives the video id, fetches timedtext, stamps 'youtube' canon, enqueues ingest", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  h.fetchUrl.mockResolvedValueOnce(bytesOf(CAPTIONS_XML));

  const result = await h.service.scrapeYoutube({ principal: principalFor(owner), url: WATCH_URL, lang: "en" });

  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("queued");
  expect(result.document.origin).toBe("youtube");
  expect(result.document.sourceUrl).toBe(WATCH_URL); // canonical watch URL
  expect(result.document.mime).toBe("text/plain");
  expect(result.document.name).toBe(VIDEO_ID); // timedtext carries no title

  // The endpoint the verb built from the id + lang (over the injected guard, exactly once).
  expect(h.fetchUrl).toHaveBeenCalledTimes(1);
  expect(h.fetchUrl).toHaveBeenCalledWith(`https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`);

  const rows = await db.select().from(documents).where(eq(documents.id, result.document.id));
  expect(rows[0]?.origin).toBe("youtube");
  expect(rows[0]?.extractedText).toContain("Never gonna give you up");
  expect(rows[0]?.extractedText).toContain("Never gonna let you down");
});

test("accepts a youtu.be short link and a bare id", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  h.fetchUrl.mockResolvedValue(bytesOf(CAPTIONS_XML));

  await h.service.scrapeYoutube({ principal: principalFor(owner), url: `https://youtu.be/${VIDEO_ID}`, lang: "en" });
  await h.service.scrapeYoutube({ principal: principalFor(owner), url: VIDEO_ID, lang: "en" });

  expect(h.fetchUrl).toHaveBeenNthCalledWith(1, `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`);
  expect(h.fetchUrl).toHaveBeenNthCalledWith(2, `https://www.youtube.com/api/timedtext?v=${VIDEO_ID}&lang=en`);
});

test("a URL with no extractable video id collapses to ScrapeFailedError before any fetch", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: "owner" });

  await expect(h.service.scrapeYoutube({ principal: principalFor(owner), url: "https://example.com/not-a-video", lang: "en" })).rejects.toBeInstanceOf(
    ScrapeFailedError,
  );
  expect(h.fetchUrl).not.toHaveBeenCalled();
});

test("a video with no caption track (empty XML) collapses to ScrapeFailedError — no row, no enqueue", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  h.fetchUrl.mockResolvedValueOnce(bytesOf('<?xml version="1.0"?><transcript></transcript>'));

  await expect(h.service.scrapeYoutube({ principal: principalFor(owner), url: WATCH_URL, lang: "en" })).rejects.toBeInstanceOf(ScrapeFailedError);
  expect(h.assetsStore).not.toHaveBeenCalled();
  expect(h.enqueueIngest).not.toHaveBeenCalled();
  const rows = await db.select().from(documents).where(eq(documents.ownerId, owner));
  expect(rows).toHaveLength(0);
});

test("a fetch refusal collapses to a leak-free ScrapeFailedError, not retry-looped", async () => {
  const db = await freshDb();
  const h = makeHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  h.fetchUrl.mockRejectedValueOnce(new Error("SSRF_BLOCKED: 10.0.0.5"));

  const error = await h.service.scrapeYoutube({ principal: principalFor(owner), url: WATCH_URL, lang: "en" }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ScrapeFailedError);
  expect((error as ScrapeFailedError).message).not.toContain("10.0.0.5");
  expect(h.fetchUrl).toHaveBeenCalledTimes(1);
});
