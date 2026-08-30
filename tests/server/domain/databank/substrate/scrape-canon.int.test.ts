// substrate/finalizeScrape — the shared §2 canon-write tail. Pins the two claims the per-scraper verb tests
// (scrape-web/youtube/wiki) don't isolate directly: a queue-ingest failure is reported HONESTLY (the document
// row still lands, outcome 'created', but `ingest: 'not-queued'` — never a rollback of canon to hide a
// derived-layer hiccup) and an extraction that yields zero chars carries the `warning: 'empty-extraction'` flag.

import { documents } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { finalizeScrape } from "../../../../../packages/server/src/domain/databank/substrate/scrape-canon.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

test("a rejecting enqueue still lands the document row; ingest is reported not-queued, no rollback", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  h.enqueueIngest.mockRejectedValueOnce(new Error("workload queue down"));

  const result = await finalizeScrape(h.ctx, {
    principal: principalFor(owner),
    bytes: new TextEncoder().encode("hello world"),
    origin: "web",
    mime: "text/html",
    name: { literal: "Test Doc" },
    sourceUrl: "https://example.com/x",
    auditAction: "databank.scrapeWeb",
  });

  expect(result.outcome).toBe("created");
  expect(result.ingest).toBe("not-queued");
  const rows = await db.select().from(documents).where(eq(documents.ownerId, owner));
  expect(rows).toHaveLength(1);
});

test("zero-char extraction carries the empty-extraction warning", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db, {
    extractor: {
      op: (): Promise<{ text: string; meta: { format: "markdown"; extractorVersion: string; charCount: number } }> =>
        Promise.resolve({ text: "", meta: { format: "markdown", extractorVersion: "v0", charCount: 0 } }),
      version: "v0",
    },
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner2") });

  const result = await finalizeScrape(h.ctx, {
    principal: principalFor(owner),
    bytes: new TextEncoder().encode("<html></html>"),
    origin: "web",
    mime: "text/html",
    name: { literal: "Empty Doc" },
    sourceUrl: "https://example.com/empty",
    auditAction: "databank.scrapeWeb",
  });

  expect(result.warning).toBe("empty-extraction");
});
