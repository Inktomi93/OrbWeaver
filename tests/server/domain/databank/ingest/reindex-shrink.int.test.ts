// A re-ingest that yields fewer chunks drops exactly the tail and keeps every chunk still in the set.
// @subject packages/server/src/domain/databank/ingest/index.ts
// @subject packages/server/src/domain/embeddings/verbs/prune-document-chunks.ts

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

const PARAGRAPH = "Shrink marker paragraph that fills a chunk on its own. ".repeat(8);

test("re-ingesting under a larger chunk size prunes the tail and keeps the surviving chunks as no-ops", async () => {
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
  const text = Array.from({ length: 12 }, (_, n) => `${PARAGRAPH}${n}`).join("\n\n");
  const { document } = await root.services.databank.createFromText({ principal: owner, name: "shrink.txt", text });
  const ingest = (): ReturnType<typeof root.app.databankIngest.ingestDocument> =>
    root.app.databankIngest.ingestDocument({ documentId: document.id, signal: new AbortController().signal });

  await root.services.settings.updateUserSettingsSection({
    principal: owner,
    input: { section: "databank", patch: { chunk: { chunkSize: 600, wholeFileThreshold: 0 } } },
  });
  const wide = await ingest();
  expect(wide.failed).toEqual([]);
  expect(wide.chunksPruned).toBe(0);

  await root.services.settings.updateUserSettingsSection({
    principal: owner,
    input: { section: "databank", patch: { chunk: { chunkSize: 20_000 } } },
  });
  const narrow = await ingest();
  expect(narrow.failed).toEqual([]);
  expect(narrow.chunksUpserted + narrow.chunksNoop).toBe(1);
  expect(narrow.chunksPruned).toBe(wide.chunksUpserted - 1);
  expect(narrow.chunksPruned).toBeGreaterThan(0);
});
