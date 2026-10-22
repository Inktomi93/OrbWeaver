// @subject tests/support/node/corpus-databank.ts
// @subject tests/support/node/factories/databank.ts
import "./composed-real.ts";
import { documents, workloads } from "@orb/db";
import { eq } from "drizzle-orm";
import { seedCorpusDatabank } from "./corpus-databank.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { seedCorpusConnections } from "./corpus-seed.ts";
import { seedCreatedDocument } from "./factories/databank.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

test("native databank output suppliers retain envelope, canon, consent and workload identities without exposing private or host-hidden sources", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A native databank witness.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const result = await seedCorpusDatabank(root);
  const { created, duplicate, hidden, memberGlobal, memberPrivate, views, memberViews } = result;
  expect(created.result).toMatchObject({ outcome: "created", ingest: "queued", document: { id: created.row.id, sourceUrl: null, chunkCount: 0 } });
  expect(created.result).not.toHaveProperty("warning");
  expect(created.result.document.charCount).toBe(44);
  expect(created.row.extractedText.length).toBe(45);
  expect(created.result.document.byteSize).toBe(new TextEncoder().encode(created.row.extractedText).length);
  expect(created.result.document.byteSize).toBeGreaterThan(created.result.document.charCount);
  expect(created.row.ownerId).toBe(result.viewerUserId);
  expect(duplicate.row).toEqual(created.row);
  expect(duplicate.result).toMatchObject({ outcome: "duplicate", ingest: "skipped", document: created.result.document });
  expect(result.renamed).toEqual({ ...created.result.document, name: "Renamed consented ledger" });
  expect(result.admitted).toMatchObject([{ id: result.reindex.workloadId, kind: "databank-reindex", ownerId: result.viewerUserId }]);
  expect(result.jobs).toMatchObject([{ id: result.reindex.workloadId, status: "succeeded", result: { documents: 1, failed: [] } }]);
  expect(views.metadata).not.toHaveProperty("extractedText");
  expect(views.source).toEqual({ ...views.metadata, extractedText: created.row.extractedText });
  expect(views.metadata.charCount).toBe(created.result.document.charCount);
  expect([views.page, result.nextPage].flatMap((page) => page?.items ?? []).find((view) => view.id === created.row.id)?.charCount).toBe(
    created.result.document.charCount,
  );
  expect(views.metadata.chunkCount).toBeGreaterThan(0);
  expect(views.metadata.embeddedCount).toBe(views.metadata.chunkCount);
  expect(views.metadata.name).toBe(result.renamed.name);
  expect(views.page.items).toHaveLength(1);
  expect(views.page.totalCount).toBe(2);
  expect(result.nextPage?.items).toHaveLength(1);
  expect(result.nextPage?.totalCount).toBe(views.page.totalCount);
  expect(result.nextPage?.items[0]?.id).not.toBe(views.page.items[0]?.id);
  expect(views.health).toMatchObject({ total: 2, passages: views.health.chunks, byPhase: { ready: 2, empty: 0, indexing: 0, embedding: 0, stalled: 0 } });
  expect(views.globalIds).toEqual([created.row.id]);
  expect(views.attachments).toMatchObject({
    global: true,
    chats: [{ id: result.room.chat.id }],
    characters: [{ id: result.character.id, name: result.character.name }],
  });
  expect(views.active.find((view) => view.id === created.row.id)?.sources).toEqual(["global", "chat", "character"]);
  expect(views.active.find((view) => view.id === hidden.row.id)).toMatchObject({ hidden: true, sources: ["chat"] });
  expect(views.active.find((view) => view.id === memberGlobal.row.id)).toMatchObject({ hidden: false, sources: ["global"] });
  expect(views.active.some((view) => view.id === memberPrivate.row.id)).toBe(false);
  expect(memberViews.page.totalCount).toBe(2);
  expect(memberViews.globalIds).toEqual([memberGlobal.row.id]);
  expect(memberViews.active.some((view) => view.id === hidden.row.id)).toBe(false);
  expect(memberViews.active.every((view) => !view.hidden)).toBe(true);
  expect(JSON.stringify(memberViews.active)).not.toContain(hidden.row.name);
  expect(result.departedAttachments).toEqual({ global: true, chats: [], characters: [{ id: result.character.id, name: result.character.name }] });
  expect(result.handedRoom.participants.some((seat) => seat.characterId === result.character.id)).toBe(false);
  expect(result.departedActive.find((view) => view.id === created.row.id)?.sources).toEqual(["chat"]);
  const member = await root.internalCallerFor(result.memberUserId);
  const caller = await root.internalCallerFor(result.viewerUserId);
  const before = { documents: await root.db.select().from(documents), jobs: await root.db.select().from(workloads) };
  await expect(member.databank.get({ id: created.row.id, includeText: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(member.databank.rename({ id: created.row.id, name: "Foreign overwrite" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(member.databank.reindex({ scope: { kind: "document", documentId: created.row.id } })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(caller.databank.listActiveForChat({ chatId: result.room.chat.id })).rejects.toThrow();
  expect({ documents: await root.db.select().from(documents), jobs: await root.db.select().from(workloads) }).toEqual(before);
  expect(await root.db.select().from(documents).where(eq(documents.id, created.row.id))).toMatchObject([
    { name: result.renamed.name, extractedText: created.row.extractedText },
  ]);
});

test("native upload and scraper envelopes use the same retained SQL metadata as duplicate, source, list and rename reads", async () => {
  const replies = new Map([
    ["https://source.example/article", "<html><head><title>Web witness</title></head><body><p>Web café 🪐.</p></body></html>"],
    ["https://empty.example/article", "<html><head></head><body></body></html>"],
    ["https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en", '<transcript><text start="0" dur="1">Video café 🪐.</text></transcript>'],
    [
      "https://wiki.example/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=Unicode",
      JSON.stringify({ query: { pages: { witness: { title: "Wiki witness", extract: "Wiki café 🪐." } } } }),
    ],
  ]);
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A native source witness.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const fetched: string[] = [];
  await using root = await createServerHarness({
    networkExecution: {
      resolver: () => Promise.resolve(["93.184.215.14"]),
      fetch: async (input, init) => {
        const request = new Request(input, init);
        const body = replies.get(request.url);
        if (body === undefined) {
          return await physical.execute(request);
        }
        replies.delete(request.url);
        fetched.push(request.url);
        return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
      },
    },
  });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const caller = await root.internalCallerFor(root.ownerId);
  const uploadParams = { principal, bytes: new TextEncoder().encode("Upload café 🪐."), mime: "text/plain", name: "Upload witness" };
  const uploaded = await seedCreatedDocument(root, { kind: "upload", params: uploadParams });
  const duplicate = await seedCreatedDocument(root, { kind: "upload", params: uploadParams });
  expect(duplicate.result).toEqual({ document: uploaded.result.document, outcome: "duplicate", ingest: "skipped" });
  const web = await seedCreatedDocument(root, { kind: "scrapeWeb", userId: root.ownerId, params: { url: "https://source.example/article" } });
  const video = await seedCreatedDocument(root, { kind: "scrapeYoutube", userId: root.ownerId, params: { url: "https://youtube.com/watch?v=dQw4w9WgXcQ" } });
  const wiki = await seedCreatedDocument(root, { kind: "scrapeWiki", userId: root.ownerId, params: { url: "https://wiki.example/wiki/Unicode" } });
  const empty = await seedCreatedDocument(root, { kind: "scrapeWeb", userId: root.ownerId, params: { url: "https://empty.example/article" } });
  expect(empty.result).toMatchObject({ outcome: "created", ingest: "queued", warning: "empty-extraction", document: { charCount: 0 } });
  const page = await caller.databank.list({ limit: 10 });
  for (const capture of [uploaded, web, video, wiki]) {
    const metadata = await caller.databank.get({ id: capture.row.id });
    const source = await caller.databank.get({ id: capture.row.id, includeText: true });
    expect(metadata).toEqual(capture.result.document);
    expect(source).toEqual({ ...metadata, extractedText: capture.row.extractedText });
    expect(metadata.charCount).toBeLessThan(capture.row.extractedText.length);
    expect(page.items.find((view) => view.id === capture.row.id)).toEqual(metadata);
    expect(await caller.databank.rename({ id: capture.row.id, name: `${metadata.name} renamed` })).toEqual({ ...metadata, name: `${metadata.name} renamed` });
    expect(capture.result).not.toHaveProperty("warning");
    expect(capture.row.ownerId).toBe(root.ownerId);
  }
  expect([uploaded, web, video, wiki].map((capture) => capture.result.document.origin)).toEqual(["upload", "web", "youtube", "wiki"]);
  expect(replies.size).toBe(0);
  expect(fetched).toEqual([
    "https://source.example/article",
    "https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en",
    "https://wiki.example/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=Unicode",
    "https://empty.example/article",
  ]);
});
