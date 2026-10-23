// @subject packages/server/src/domain/chat/engine/engine.ts
// Real stored digests and a genuinely unbound reranker exercise scope and per-turn degradation episodes.
import { createCharacterSchema } from "@orb/contracts/character";
import { chatDigests, chatEvents, closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, ChatRootOptions, HeldStatement } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  freshHeldDb,
  seedMessage,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const RECALL_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64 } as const;
const RETRIEVAL_ROWS = [
  { label: "scoped speakers", group: { output: "per-speaker", cardScope: "scoped", policy: "list", allowSelfResponses: true }, recalls: 3, speakers: 2 },
  { label: "merged speakers", group: { output: "per-speaker", cardScope: "merged", policy: "list", allowSelfResponses: true }, recalls: 1, speakers: 2 },
  { label: "narrator", group: { output: "narrator", policy: "list", allowSelfResponses: true }, recalls: 1, speakers: 1 },
] as const;

async function recallRoom(group: NonNullable<ChatRootOptions["group"]>, options: Pick<ChatRootOptions, "server"> = {}): Promise<ChatRoot> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body): string =>
      body.includes("Transcript block:")
        ? "An earlier ledger scene\nThe keeper remembers the earlier orbital ledger scene.\nKeywords: ledger"
        : "The keeper recalls the earlier ledger scene.",
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      ...options,
      server: { startJobs: false, ...options.server },
      providerFetch: physical.execute,
      memoryEnabled: true,
      memoryDefaults: { mode: "mixC", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
      group,
      characters: [
        createCharacterSchema.parse({ handle: "recall-aria", name: "Aria", description: "The first keeper of the ledger." }),
        createCharacterSchema.parse({ handle: "recall-bryn", name: "Bryn", description: "The second keeper of the ledger." }),
      ],
    }),
  );
  await h.caller.connection.setBinding({ task: "rerank", connectionId: null });
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the actual recall room has no initial speaker");
  }
  for (let seq = 1; seq <= 12; seq += 1) {
    await seedMessage(
      h.root.db,
      { chatId: h.chatId, seq, characterId: first.id, content: `Earlier ledger scene ${seq}: ${"orbital ledger ballast ".repeat(160)}` },
      h.root.idSource,
    );
  }
  const built = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: first.id, intent: RECALL_INTENT });
  if (built.aborted) {
    throw new Error("the actual recall warm-up aborted before building its canonical digests");
  }
  await h.root.settleBackground();
  const runAdmittedWorkload = h.root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the actual recall fixture has no admitted-workload driver");
  }
  const workloadLifetime = new AbortController();
  construction.defer(() => workloadLifetime.abort());
  const admitted = [
    await h.caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await h.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await h.caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  for (const job of admitted) {
    await runAdmittedWorkload(job.id, workloadLifetime.signal);
    const completed = await h.caller.workloads.get({ id: job.id });
    if (completed.status !== "succeeded") {
      throw new Error(`the actual recall corpus workload did not succeed: ${completed.kind} ${completed.status}`);
    }
  }
  expect(await h.caller.search.spaceStatus()).toMatchObject({ paused: false, embed: false });
  const queryable = await h.caller.search.search({
    query: "orbital ledger",
    over: "digests",
    scope: { kind: "chat", chatId: h.chatId },
    topN: 1,
    rerank: false,
  });
  if (queryable.over !== "digests") {
    throw new Error("the real scoped digest query returned a different search target");
  }
  expect(queryable.hits.length).toBeGreaterThan(0);
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test.for(RETRIEVAL_ROWS)("$label retain their real recall scope and warn once per degraded turn, then warn again next turn", async (row) => {
  await using h = await recallRoom(row.group);
  const digests = await h.root.db.select().from(chatDigests).where(eq(chatDigests.chatId, h.chatId));
  expect(digests.length).toBeGreaterThan(0);
  const characterIds = h.characters.map((character) => character.id);
  const shared = digests.find((digest) => !characterIds.includes(digest.scopedCharacterId))?.scopedCharacterId;
  if (shared === undefined) {
    throw new Error("the actual memory warm-up built no shared group bucket");
  }
  for (const turn of ["First", "Second"]) {
    const beforeRecall = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
    const beforeWarning = (await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId))).length;
    const outcome = await h.root.services.chat.send({
      principal: h.owner,
      chatId: h.chatId,
      content: `${turn}: recall the earlier ledger scene.`,
      intent: RECALL_INTENT,
    });
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages.filter((message) => message.role === "assistant")).toHaveLength(row.speakers);
    await h.root.settleBackground();
    const recalls = h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((recall) => recall.seq > beforeRecall);
    expect(recalls).toHaveLength(row.recalls);
    expect(recalls.map((recall) => recall.scopedCharacterId)).toEqual(row.recalls === 3 ? [shared, ...characterIds] : [shared]);
    expect(recalls.every((recall) => recall.trace.poolSize > 0 && recall.trace.candidateCount > 0 && recall.trace.surfaced > 0)).toBe(true);
    const events = (await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq)).slice(beforeWarning);
    expect(events.filter(({ payload }) => payload.type === "warning" && payload.code === "memory_rerank_unavailable")).toHaveLength(1);
    expect(events.filter(({ payload }) => payload.type === "warning" && payload.code === "retrieval_index_unavailable")).toEqual([]);
  }
});

test("one actual turn independently warns once for a degraded shared rerank and a later unavailable per-speaker index", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const h = ownership.use(await recallRoom(RETRIEVAL_ROWS[0].group, { server: { db: held.db } }));
  const bindings = await h.caller.connection.listBindings();
  const embed = bindings.find((binding) => binding.task === "embed")?.binding?.connectionId;
  if (embed === undefined || embed === null) {
    throw new Error("the real recall corpus has no owned embedding connection");
  }
  const beforeRecall = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  const beforeEvent = (await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId))).length;
  let boundary: HeldStatement | undefined;
  const started = Promise.withResolvers<HeldStatement>();
  ownership.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId && event.type === "turnStarted" && boundary === undefined) {
        boundary = held.hold(/^select .* from "chat_digests"/u);
        started.resolve(boundary);
      }
    }),
  );
  const running = h.root.services.chat.send({
    principal: h.owner,
    chatId: h.chatId,
    content: "Recall the earlier ledger scene across this encoder deletion.",
    intent: RECALL_INTENT,
  });
  const settled = Promise.allSettled([running]);
  const premature = running.then(() => {
    throw new Error("the actual recall turn settled before its held per-speaker digest read");
  });
  try {
    const gate = await Promise.race([started.promise, premature]);
    await Promise.race([gate.reached, premature]);
    const shared = h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((recall) => recall.seq > beforeRecall);
    expect(shared).toHaveLength(1);
    expect(shared[0]?.trace).toMatchObject({ queryEmbedded: true });
    expect(shared[0]?.trace.surfaced).toBeGreaterThan(0);
    gate.disarm();
    await h.caller.connection.remove({ connectionId: embed });
    gate.release();
    expect((await running).aborted).toBe(false);
    await h.root.settleBackground();
    const recalls = h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((recall) => recall.seq > beforeRecall);
    expect(recalls).toHaveLength(3);
    expect(recalls.slice(1).map((recall) => recall.trace.note)).toEqual(["vector space unavailable", "vector space unavailable"]);
    const events = (await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq)).slice(beforeEvent);
    const retrievalWarnings = events.filter(
      ({ payload }) => payload.type === "warning" && (payload.code === "retrieval_index_unavailable" || payload.code === "memory_rerank_unavailable"),
    );
    expect(retrievalWarnings.map(({ payload }) => payload)).toMatchObject([
      { type: "warning", code: "retrieval_index_unavailable" },
      { type: "warning", code: "memory_rerank_unavailable" },
    ]);
    expect(retrievalWarnings).toHaveLength(2);
    expect(events.filter(({ payload }) => payload.type === "warning" && payload.code === "memory_build_failed")).toHaveLength(2);
    expect(events.filter(({ payload }) => payload.type === "turnCompleted")).toHaveLength(2);
    expect(events.filter(({ payload }) => payload.type === "turnAborted")).toEqual([]);
  } finally {
    boundary?.release();
    await settled;
  }
});
