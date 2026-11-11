// A document whose text is only whitespace has a chunk the embedder filters out, so the store refuses to write a vector
// for it and the ingest records that document as failed with wording a client can read, and the server logs the lens and
// model once; a document with text beside it is unaffected.
// @subject packages/server/src/domain/databank/ingest/index.ts
// @subject packages/server/src/domain/embeddings/verbs/store.ts

import { present } from "@orb/testkit/iso";
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
import { z } from "zod";

const LOG_SCAN_LIMIT = 2000;
const embedFailureRecordSchema = z.looseObject({ level: z.string(), lens: z.string(), model: z.string() });

test("a whitespace-only document fails its ingest while a document with text lands its chunk", async () => {
  await using root = await createServerHarness({
    logLevel: "warn",
    providerFetch: createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "A completed corpus response.",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    }).execute,
  });
  const { owner } = await seedCorpusActors(root);
  const ingest = (
    documentId: Parameters<typeof root.app.databankIngest.ingestDocument>[0]["documentId"],
  ): ReturnType<typeof root.app.databankIngest.ingestDocument> => root.app.databankIngest.ingestDocument({ documentId, signal: new AbortController().signal });

  const written = await root.services.databank.createFromText({ principal: owner, name: "text.txt", text: "A lantern marks the northern pass." });
  const landed = await ingest(written.document.id);
  expect(landed.failed).toEqual([]);
  expect(landed.chunksUpserted).toBe(1);

  const blank = await root.services.databank.createFromText({ principal: owner, name: "blank.txt", text: " \n\t \n " });
  const refused = await ingest(blank.document.id);
  expect(refused.chunksUpserted).toBe(0);
  expect(refused.failed).toHaveLength(1);
  expect(refused.failed[0]).toMatchObject({ documentId: blank.document.id });
  expect(present(refused.failed[0]).error).not.toContain(CORPUS_EMBED_MODEL);
  const logged = root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => embedFailureRecordSchema.safeParse(JSON.parse(line)))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  expect(logged).toHaveLength(1);
  expect(logged[0]).toMatchObject({ level: "warn", lens: "chunk" });
  expect(present(logged[0]).model).toContain(CORPUS_EMBED_MODEL);
});
