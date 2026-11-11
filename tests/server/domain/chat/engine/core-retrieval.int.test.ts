// @subject packages/server/src/domain/chat/engine/engine.ts
// Real stored digests and a genuinely unbound reranker exercise scope and per-turn degradation episodes.
import { createCharacterSchema } from "@orb/contracts/character";
import { embedGenerations } from "@orb/db";
import { nonEmpty } from "@orb/testkit/iso";
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
  SUMMARIZE_TRANSCRIPT_MARKER,
  summaryReply,
  withheldTable,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const LOG_SCAN_LIMIT = 200;
const TIME_ZONE = "Etc/UTC";
const MISSING_TABLE = "no such table";
const logRecordSchema = z.looseObject({ level: z.string(), err: z.looseObject({ message: z.string() }).optional() });
const RECALL_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64 } as const;
const RETRIEVAL_ROWS = [
  { label: "scoped speakers", group: { output: "per-speaker", cardScope: "scoped", policy: "list", allowSelfResponses: true }, recalls: 3, speakers: 2 },
  { label: "merged speakers", group: { output: "per-speaker", cardScope: "merged", policy: "list", allowSelfResponses: true }, recalls: 1, speakers: 2 },
  { label: "narrator", group: { output: "narrator", policy: "list", allowSelfResponses: true }, recalls: 1, speakers: 1 },
] as const;

/** Run the corpus workloads that give the owner a promoted encoder generation, then prove the room's digests answer a scoped query. */
async function indexRecallCorpus(h: ChatRoot, signal: AbortSignal): Promise<void> {
  const runAdmittedWorkload = h.root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the actual recall fixture has no admitted-workload driver");
  }
  const admitted = [
    await h.caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await h.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await h.caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  for (const job of admitted) {
    await runAdmittedWorkload(job.id, signal);
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
}

async function recallRoom(group: NonNullable<ChatRootOptions["group"]>, options: Pick<ChatRootOptions, "server"> = {}): Promise<ChatRoot> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body): string =>
      body.includes(SUMMARIZE_TRANSCRIPT_MARKER)
        ? summaryReply({ anchor: "An earlier ledger scene", facts: "The keeper remembers the earlier orbital ledger scene.", keywords: ["ledger"] })
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
      // Twelve earlier scenes voiced by the primary seat, written by the native transcript import.
      transcript: Array.from({ length: 12 }, (_, index) => ({
        role: "assistant" as const,
        content: `Earlier ledger scene ${index + 1}: ${"orbital ledger ballast ".repeat(160)}`,
      })),
    }),
  );
  await h.caller.connection.setBinding({ task: "rerank", connectionId: null });
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the actual recall room has no initial speaker");
  }

  const built = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: first.id, intent: RECALL_INTENT });
  if (built.aborted) {
    throw new Error("the actual recall warm-up aborted before building its canonical digests");
  }
  await h.root.settleBackground();
  const workloadLifetime = new AbortController();
  construction.defer(() => workloadLifetime.abort());
  await indexRecallCorpus(h, workloadLifetime.signal);
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

test.for(RETRIEVAL_ROWS)("$label retain their real recall scope and warn once per degraded turn, then warn again next turn", async (row) => {
  await using h = await recallRoom(row.group);
  const characterIds = h.characters.map((character) => character.id);
  // The group memory build keys its shared bucket by the room's minted synthetic character.
  const shared = (await h.root.services.character.findSyntheticGroupCharacter({ ownerId: h.owner.userId, chatId: h.chatId }))?.characterId;
  if (shared === undefined) {
    throw new Error("the actual memory warm-up built no shared group bucket");
  }
  for (const turn of ["First", "Second"]) {
    const beforeRecall = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
    const beforeWarning = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).length;
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
    expect(nonEmpty(recalls).every((recall) => recall.trace.poolSize > 0 && recall.trace.candidateCount > 0 && recall.trace.surfaced > 0)).toBe(true);
    const events = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).slice(beforeWarning);
    expect(events.filter(({ event }) => event.type === "warning" && event.code === "memory_rerank_unavailable")).toHaveLength(1);
    expect(events.filter(({ event }) => event.type === "warning" && event.code === "retrieval_index_unavailable")).toEqual([]);
  }
});

test("one actual turn independently warns once for a degraded shared rerank and a later unavailable per-speaker index", async () => {
  using held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  const h = ownership.use(await recallRoom(RETRIEVAL_ROWS[0].group, { server: { db: held.db } }));
  const bindings = await h.caller.connection.listBindings();
  const embed = bindings.find((binding) => binding.task === "embed")?.binding?.connectionId;
  if (embed === undefined || embed === null) {
    throw new Error("the real recall corpus has no owned embedding connection");
  }
  const beforeRecall = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  const beforeEvent = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).length;
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
    const events = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).slice(beforeEvent);
    const retrievalWarnings = events.filter(
      ({ event }) => event.type === "warning" && (event.code === "retrieval_index_unavailable" || event.code === "memory_rerank_unavailable"),
    );
    expect(retrievalWarnings.map(({ event }) => event)).toMatchObject([
      { type: "warning", code: "retrieval_index_unavailable" },
      { type: "warning", code: "memory_rerank_unavailable" },
    ]);
    expect(retrievalWarnings).toHaveLength(2);
    expect(events.filter(({ event }) => event.type === "warning" && event.code === "memory_build_failed")).toHaveLength(2);
    expect(events.filter(({ event }) => event.type === "turnCompleted")).toHaveLength(2);
    expect(events.filter(({ event }) => event.type === "turnAborted")).toEqual([]);
  } finally {
    boundary?.release();
    await settled;
  }
});

test("a retrieval failure that is not a space refusal fails the actual turn with the surfaced error, logged once, and reports no unavailable index", async () => {
  using held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  const h = ownership.use(await recallRoom(RETRIEVAL_ROWS[0].group, { server: { db: held.db, logLevel: "error" } }));
  const faultLogs = (): number =>
    h.root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => logRecordSchema.parse(JSON.parse(line)))
      .filter((record) => record.level === "error" && record.err?.message.includes(MISSING_TABLE) === true).length;
  const logsBefore = faultLogs();
  const beforeEvent = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).length;
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
  const running = h.caller.chat.send({ chatId: h.chatId, content: "Recall the earlier ledger scene.", intent: RECALL_INTENT, timeZone: TIME_ZONE });
  const settled = Promise.allSettled([running]);
  try {
    const gate = await started.promise;
    await gate.reached;
    gate.disarm();
    // The shared recall already ran; the per-speaker retrieval reads its generation row after this point.
    await using _fault = await withheldTable(h.root.db, embedGenerations);
    gate.release();
    await expect(running).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  } finally {
    boundary?.release();
    await settled;
  }
  expect(faultLogs() - logsBefore).toBe(1);
  const events = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).slice(beforeEvent);
  expect(events.filter(({ event }) => event.type === "warning" && event.code === "retrieval_index_unavailable")).toEqual([]);
});

test("an unbound encoder lets the actual turn complete without retrieval and warns once that the index is unavailable", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: "The keeper answers without recalling anything.",
  });
  await using h = await createChatRoot({ providerFetch: physical.execute, server: { startJobs: false } });
  const ledger = await h.caller.databank.createFromText({ name: "Ledger", text: "The orbital ledger preserves the harbor witness." });
  await h.caller.databank.attachToChat({ chatId: h.chatId, documentId: ledger.document.id });
  await h.caller.connection.setBinding({ task: "embed", connectionId: null });
  const beforeEvent = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).length;
  const outcome = await h.caller.chat.send({ chatId: h.chatId, content: "Recall the earlier ledger scene.", intent: RECALL_INTENT, timeZone: TIME_ZONE });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toHaveLength(1);
  const events = (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).slice(beforeEvent);
  expect(events.filter(({ event }) => event.type === "warning" && event.code === "retrieval_index_unavailable")).toHaveLength(1);
  expect(events.filter(({ event }) => event.type === "turnCompleted")).toHaveLength(1);
});
