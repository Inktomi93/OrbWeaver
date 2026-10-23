// @subject packages/server/src/domain/embeddings/verbs/vacuous-memory-receipt.ts
// @subject packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts
// @subject packages/server/src/domain/chat/workload-contributions.ts
// @subject packages/server/src/domain/chat/persistence/backfill-scope.ts
// @subject packages/server/src/domain/embeddings/persistence/space-state.ts
// @subject packages/server/src/domain/search/persistence/active-space.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import {
  characterEmbeddings,
  chatDigests,
  chatParticipants,
  chatSegments,
  chats,
  closeDb,
  documentChunks,
  embedGenerationTargets,
  embedSpaceState,
} from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { vi } from "vitest";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

test("an enabled owner with indexed cards and ingested documents but no hosted room completes real text search", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("empty-owner completion must not request a paid summary");
    },
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const actor = await root.actor();
  const principal = await root.principalFor(actor.id);
  const caller = await root.internalCallerFor(actor.id);
  await seedCorpusConnections(root, principal);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "empty-owner-ledger", name: "Ledger keeper", description: "Preserves the orbital ledger." }),
  });
  const document = await caller.databank.createFromText({ name: "Empty-owner ledger", text: "The orbital ledger preserves the harbor witness." });
  const ingested = await root.app.databankIngest.ingestDocument({ documentId: document.document.id, signal: new AbortController().signal });
  expect(ingested.failed).toEqual([]);
  expect(ingested.chunksUpserted).toBeGreaterThan(0);
  const started = [
    await caller.workloads.start({ input: { kind: "index", params: { source: "all" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  for (const job of started) {
    await executeAdmitted(root, job.id);
    const completed = await caller.workloads.get({ id: job.id });
    if (completed.status === "failed") {
      throw new Error(JSON.stringify(completed));
    }
    await expect.poll(async () => (await caller.workloads.get({ id: job.id })).status).toBe("succeeded");
  }
  await root.settleBackground();
  const jobs = await Promise.all(started.map(({ id }) => caller.workloads.get({ id })));
  expect(jobs.map(({ kind, status, ownerId, funderUserId }) => ({ kind, status, ownerId, funderUserId }))).toEqual([
    { kind: "index", status: "succeeded", ownerId: actor.id, funderUserId: actor.id },
    { kind: "memory-backfill", status: "succeeded", ownerId: actor.id, funderUserId: actor.id },
    { kind: "databank-reindex", status: "succeeded", ownerId: actor.id, funderUserId: actor.id },
  ]);
  expect(await root.db.select().from(chats)).toEqual([]);
  expect(await root.db.select().from(chatParticipants)).toEqual([]);
  expect(await root.db.select().from(chatDigests)).toEqual([]);
  expect(await root.db.select().from(chatSegments)).toEqual([]);
  expect(await root.db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, card.id))).not.toEqual([]);
  expect(await root.db.select().from(documentChunks).where(eq(documentChunks.documentId, document.document.id))).not.toEqual([]);
  const target = await root.db
    .select()
    .from(embedGenerationTargets)
    .where(and(eq(embedGenerationTargets.ownerId, actor.id), eq(embedGenerationTargets.task, "embed")))
    .get();
  if (target === undefined) {
    throw new Error("native indexing produced no real embedding target");
  }
  const states = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, actor.id)).orderBy(embedSpaceState.scope);
  expect(states.filter(({ scope }) => scope !== "images").map(({ scope, activeGenerationId }) => ({ scope, activeGenerationId }))).toEqual([
    { scope: "cards", activeGenerationId: target.generationId },
    { scope: "documents", activeGenerationId: target.generationId },
    { scope: "memory", activeGenerationId: target.generationId },
  ]);
  expect(await caller.search.spaceStatus()).toEqual({ paused: false, embed: false, imageEmbed: false });
  const cards = await caller.search.search({ query: "orbital ledger", over: "entities", scope: { kind: "owner" }, topN: 5, rerank: false });
  if (cards.over !== "entities") {
    throw new Error("the native card search returned the wrong result arm");
  }
  expect(cards.hits.map(({ characterId }) => characterId)).toEqual([card.id]);
  const passages = await caller.search.search({ query: "orbital ledger", over: "documents", scope: { kind: "owner" }, topN: 5, rerank: false });
  if (passages.over !== "documents") {
    throw new Error("the native document search returned the wrong result arm");
  }
  expect(passages.hits.map(({ documentId }) => documentId)).toEqual([document.document.id]);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual([]);
});

async function admitted(root: ServerTestHarness, id: Parameters<typeof executeAdmitted>[1]): Promise<void> {
  await executeAdmitted(root, id);
  await expect.poll(async () => (await root.services.workloads.get({ caller: null, id })).status).not.toMatch(/queued|running|cancelling/u);
}

async function enableOwner(
  root: ServerTestHarness,
  withMemory = true,
): Promise<{
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
  readonly card: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>;
}> {
  const principal = await root.principalFor((await root.actor()).id);
  const caller = await root.internalCallerFor(principal.userId);
  await seedCorpusConnections(root, principal);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "held-empty-ledger", name: "Held ledger", description: "Keeps the orbital ledger." }),
  });
  const document = await caller.databank.createFromText({ name: "Held ledger", text: "The harbor witness keeps the orbital ledger." });
  const ingest = await root.app.databankIngest.ingestDocument({ documentId: document.document.id, signal: new AbortController().signal });
  expect(ingest.failed).toEqual([]);
  expect(ingest.chunksUpserted).toBeGreaterThan(0);
  for (const input of [
    { kind: "index", params: { source: "all" } },
    ...(withMemory ? [{ kind: "memory-backfill", params: {} } as const] : []),
    { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
  ] as const) {
    const job = await caller.workloads.start({ input, mode: "singular" });
    await admitted(root, job.id);
    expect(await caller.workloads.get({ id: job.id })).toMatchObject({ status: "succeeded", ownerId: principal.userId, funderUserId: principal.userId });
  }
  await root.settleBackground();
  expect((await caller.search.spaceStatus()).embed).toBe(!withMemory);
  return { principal, caller, card };
}

for (const change of ["start", "handoff", "binding-target", "user-config", "app-config"] as const) {
  test(`a held native empty-memory receipt handles actual ${change} changes without inventing completion`, async () => {
    let summaries = 1;
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "",
      structuredReplies: new Map(),
      images: [],
      completion: () => {
        if (summaries-- <= 0) {
          throw new Error("the empty-owner retry summary script is exhausted");
        }
        return { text: "The harbor witness preserves the orbital ledger.", toolCalls: [], usage: { promptTokens: 50, completionTokens: 15 } };
      },
    });
    const held = await freshHeldDb();
    await using resources = new AsyncDisposableStack();
    resources.defer(() => closeDb(held.db));
    const root = resources.use(await createServerHarness({ db: held.db, providerFetch: physical.execute }));
    const owner = await enableOwner(root);
    const foreign = await root.principalFor((await root.actor()).id);
    const room = await root.services.chat.startChat({ principal: foreign, characterIds: [], opening: "none" });
    const invitation = await root.services.chat.createInvite({ principal: foreign, chatId: room.chat.id, input: { invitedHandle: owner.principal.handle } });
    await root.services.chat.acceptInvite({ principal: owner.principal, inviteId: invitation.invite.id });
    await root.services.chat.nominateHostHandoff({ principal: foreign, chatId: room.chat.id, userId: owner.principal.userId });
    const beforeCalls = [...physical.requests];
    const gate = held.hold(/^insert into "embed_space_state"/u);
    let pending: Promise<void> | undefined;
    let ownedChatId = room.chat.id;
    try {
      const job = await owner.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
      pending = executeAdmitted(root, job.id);
      await gate.reached;
      gate.disarm();
      if (change === "start") {
        const started = await owner.caller.chat.startChat({ characterIds: [owner.card.id], opening: "none" });
        ownedChatId = started.chat.id;
      } else if (change === "handoff") {
        await root.services.chat.acceptHostHandoff({ principal: owner.principal, chatId: room.chat.id });
        await owner.caller.chat.addCharacterToChat({ chatId: room.chat.id, characterId: owner.card.id });
      } else if (change === "binding-target") {
        const replacement = await root.services.connection.create({
          principal: owner.principal,
          providerId: "custom-openai",
          credentialId: null,
          baseUrl: CORPUS_PROVIDER_ENDPOINT,
          model: CORPUS_EMBED_MODEL,
          allowBackground: true,
          declared: { kind: "embedding", embedding: { dims: CORPUS_EMBEDDING_VECTOR.length, maxInputTokens: 8192 }, features: { detectServer: false } },
        });
        await root.services.connection.setBinding({ principal: owner.principal, task: "embed", connectionId: replacement.id });
        await root.settleBackground();
      } else if (change === "user-config") {
        await owner.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
      } else {
        await root.services.settings.updateAppSettings({ principal: await root.principalFor(root.ownerId), partial: { memoryDefaults: { mode: "off" } } });
      }
      const expected = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner.principal.userId)).orderBy(embedSpaceState.scope);
      const target = await root.db
        .select()
        .from(embedGenerationTargets)
        .where(and(eq(embedGenerationTargets.ownerId, owner.principal.userId), eq(embedGenerationTargets.task, "embed")))
        .get();
      gate.release();
      await pending;
      await expect.poll(async () => (await owner.caller.workloads.get({ id: job.id })).status).not.toMatch(/queued|running|cancelling/u);
      const result = await owner.caller.workloads.get({ id: job.id });
      const refused = change === "start" || change === "handoff" || change === "binding-target";
      if (target === undefined) {
        throw new Error("the held native receipt lost its current target");
      }
      expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner.principal.userId)).orderBy(embedSpaceState.scope)).toEqual(
        refused
          ? expected
          : expected.map((row) => (row.scope === "memory" ? { ...row, candidateGenerationId: target.generationId, candidateEpoch: target.epoch } : row)),
      );
      expect(result.status).toBe(refused ? "failed" : "succeeded");
      expect(result.error).toBe(refused ? "empty owner memory scope or target changed before completion" : null);
      expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual([]);
      if (change === "start" || change === "handoff") {
        await assertCurrentHostRetry(root, owner, { chatId: ownedChatId, failedJobId: job.id, beforeCalls, physical });
      }
    } finally {
      gate.release();
      await pending;
    }
  });
}

async function assertCurrentHostRetry(
  root: ServerTestHarness,
  owner: Awaited<ReturnType<typeof enableOwner>>,
  input: {
    readonly chatId: Parameters<ServerTestHarness["services"]["chat"]["commitMessage"]>[0]["chatId"];
    readonly failedJobId: Parameters<typeof executeAdmitted>[1];
    readonly beforeCalls: readonly string[];
    readonly physical: ReturnType<typeof createCorpusProviderExecution>;
  },
): Promise<void> {
  // D55: fresh rooms produce no memory work; only real aged canon makes this retry nonempty.
  expect(await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, input.chatId))).toEqual([]);
  expect(await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, input.chatId))).toEqual([]);
  expect(input.physical.requests).toEqual(input.beforeCalls);
  for (let scene = 0; scene <= DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow; scene += 1) {
    await owner.caller.chat.commitMessage({ chatId: input.chatId, content: `The harbor witness preserves ledger scene ${scene}.`, timeZone: UTC_TIME_ZONE });
  }
  const retry = await owner.caller.workloads.retry({ id: input.failedJobId });
  await admitted(root, retry.id);
  expect(await owner.caller.workloads.get({ id: retry.id })).toMatchObject({
    status: "succeeded",
    ownerId: owner.principal.userId,
    funderUserId: owner.principal.userId,
  });
  expect(await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, input.chatId))).not.toEqual([]);
  expect(await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, input.chatId))).not.toEqual([]);
}

for (const params of [{ segmentsOnly: true }, { importWindow: { from: 0, to: 0 } }] as const) {
  test(`partial native memory passes do not borrow whole-owner empty completion: ${JSON.stringify(params)}`, async () => {
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
      embedding: CORPUS_EMBEDDING_VECTOR,
      chatText: "",
      structuredReplies: new Map(),
      images: [],
      completion: () => {
        throw new Error("partial empty passes must not summarize");
      },
    });
    await using root = await createServerHarness({ providerFetch: physical.execute });
    const owner = await enableOwner(root);
    const completion = vi.spyOn(root.app.embeddings, "purgeMemoryVectors");
    const before = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner.principal.userId)).orderBy(embedSpaceState.scope);
    const job = await owner.caller.workloads.start({ input: { kind: "memory-backfill", params }, mode: "singular" });
    await admitted(root, job.id);
    expect(await owner.caller.workloads.get({ id: job.id })).toMatchObject({ status: "succeeded", ownerId: owner.principal.userId });
    expect(completion.mock.calls).toEqual([]);
    expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner.principal.userId)).orderBy(embedSpaceState.scope)).toEqual(
      before,
    );
  });
}

test("an atomic empty-owner receipt leaves no candidate for a later scope after host changes", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("a fresh room must not summarize");
    },
  });
  const held = await freshHeldDb();
  await using resources = new AsyncDisposableStack();
  resources.defer(() => closeDb(held.db));
  const root = resources.use(await createServerHarness({ db: held.db, providerFetch: physical.execute }));
  const owner = await enableOwner(root, false);
  const gate = held.hold(/^update "embed_space_state"/u);
  let pending: Promise<void> | undefined;
  try {
    const job = await owner.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
    pending = executeAdmitted(root, job.id);
    await gate.reached;
    gate.disarm();
    const candidate = await root.db
      .select()
      .from(embedSpaceState)
      .where(and(eq(embedSpaceState.ownerId, owner.principal.userId), eq(embedSpaceState.scope, "memory")))
      .get();
    expect(candidate).toBeUndefined();
    const beforeCalls = [...physical.requests];
    const room = await owner.caller.chat.startChat({ characterIds: [owner.card.id], opening: "none" });
    const expected = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner.principal.userId)).orderBy(embedSpaceState.scope);
    gate.release();
    await pending;
    expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner.principal.userId)).orderBy(embedSpaceState.scope)).toEqual(
      expected,
    );
    expect((await owner.caller.search.spaceStatus()).embed).toBe(true);
    await expect.poll(async () => (await owner.caller.workloads.get({ id: job.id })).status).toBe("failed");
    expect(await owner.caller.workloads.get({ id: job.id })).toMatchObject({ error: "empty owner memory scope or target changed before completion" });
    await expect(owner.caller.search.search({ query: "orbital ledger", over: "entities", scope: { kind: "owner" }, topN: 5 })).rejects.toMatchObject({
      cause: { code: "search_space_reindexing" },
    });
    expect(await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, room.chat.id))).toEqual([]);
    expect(await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, room.chat.id))).toEqual([]);
    expect(physical.requests).toEqual(beforeCalls);
    const laterCardSweep = await owner.caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" });
    await admitted(root, laterCardSweep.id);
    expect(await owner.caller.workloads.get({ id: laterCardSweep.id })).toMatchObject({ status: "succeeded" });
    expect((await owner.caller.search.spaceStatus()).embed).toBe(true);
  } finally {
    gate.release();
    await pending;
  }
});

test("departed host history and a foreign room do not widen an empty owner's completion or its neighbor", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("an empty host universe must not summarize");
    },
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const owner = await enableOwner(root);
  const departed = await owner.caller.chat.startChat({ characterIds: [owner.card.id], opening: "none" });
  await root.services.chat.selfLeave({ principal: owner.principal, chatId: departed.chat.id });
  const seats = await root.db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, departed.chat.id), eq(chatParticipants.userId, owner.principal.userId)));
  expect(seats).toMatchObject([{ kind: "human", role: "host" }]);
  expect(seats[0]?.leftSeq).not.toBeNull();
  const foreign = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, foreign);
  await root.services.chat.startChat({ principal: foreign, characterIds: [], opening: "none" });
  const otherBefore = await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, foreign.userId)).orderBy(embedSpaceState.scope);
  const job = await owner.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
  await admitted(root, job.id);
  expect(await owner.caller.workloads.get({ id: job.id })).toMatchObject({
    status: "succeeded",
    ownerId: owner.principal.userId,
    funderUserId: owner.principal.userId,
    result: { segments: { scanned: 0, changed: 0 }, digests: { scanned: 0, changed: 0 }, failed: 0 },
  });
  expect((await owner.caller.search.spaceStatus()).embed).toBe(false);
  expect(await root.db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, foreign.userId)).orderBy(embedSpaceState.scope)).toEqual(otherBefore);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual([]);
});
