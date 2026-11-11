// A `re-extract` sweep after an extractor upgrade: a document stamped by an older extractor has its canon re-derived
// from its stored bytes and is stamped current, and a document that carries the current stamp is left alone. The
// stale stamp is planted directly, because the only product path to one is shipping a new extractor version.
// @subject packages/server/src/domain/databank/ingest/index.ts
// @subject packages/server/src/domain/databank/persistence/queries.ts

import { documents } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { strToU8 } from "fflate";

const STALE_VERSION = "an-older-extractor";
const STALE_CANON = "canon an older extractor derived";
const STALE_BYTES = "The keeper's ledger.";
const CURRENT_BYTES = "The harbor log.";

test("a re-extract sweep re-derives a document an older extractor stamped and leaves a current one alone", async () => {
  await using root = await createServerHarness({
    providerFetch: createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "A completed corpus response.",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    }).execute,
  });
  const { owner } = await seedCorpusActors(root);
  const upload = (name: string, text: string): ReturnType<typeof root.services.databank.upload> =>
    root.services.databank.upload({ principal: owner, bytes: strToU8(text), mime: "text/plain", name });
  const stale = (await upload("stale.txt", STALE_BYTES)).document;
  const current = (await upload("current.txt", CURRENT_BYTES)).document;
  const canonOf = async (id: typeof stale.id): Promise<string | undefined> =>
    (await root.services.databank.get({ principal: owner, id, includeText: true })).extractedText;

  // A fresh upload is stamped with the version the sweep compares against, so nothing is stale yet.
  expect((await root.services.databank.bankHealth({ principal: owner })).staleExtraction).toBe(0);

  await root.db.update(documents).set({ extractorVersion: STALE_VERSION, extractedText: STALE_CANON }).where(eq(documents.id, stale.id));
  expect((await root.services.databank.bankHealth({ principal: owner })).staleExtraction).toBe(1);
  expect(await canonOf(stale.id)).toBe(STALE_CANON);

  const swept = await root.app.databankIngest.reindex({
    ownerId: owner.userId,
    scope: { kind: "owner" },
    mode: "re-extract",
    signal: new AbortController().signal,
  });

  expect(swept).toMatchObject({ documents: 2, reExtracted: 1, failed: [] });
  expect(await canonOf(stale.id)).toBe(STALE_BYTES);
  expect(await canonOf(current.id)).toBe(CURRENT_BYTES);
  expect((await root.services.databank.bankHealth({ principal: owner })).staleExtraction).toBe(0);
});
