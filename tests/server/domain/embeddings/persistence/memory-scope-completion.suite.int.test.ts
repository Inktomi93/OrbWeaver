// Search completes when the memory scope can build no digests: memory on with no summarize connection embeds its
// segments, makes no digest and completes; memory off after an encoder move drops the old-model segments and completes.
// @subject packages/server/src/domain/embeddings/verbs/vacuous-memory-receipt.ts
// @subject packages/server/src/domain/embeddings/verbs/vector-sweep-ops.ts
// @subject packages/server/src/domain/embeddings/verbs/embedding-reindex-triggers.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import { chatDigests, chatSegments } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_ALTERNATE_EMBED_MODEL,
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedAlternateEmbedder,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { executeAdmitted } from "../../workloads/funding.fixtures.ts";

const AGED_MESSAGES = DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow + 1;

interface Owner {
  readonly root: ServerTestHarness;
  readonly principal: Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
  readonly cardId: Awaited<ReturnType<ServerTestHarness["services"]["character"]["create"]>>["id"];
  readonly chatId: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"]["id"];
}

/** An owner with memory on and a room whose canon is old enough for memory to chunk, on a scripted embedding endpoint. */
async function ownerWithAgedRoom(stack: AsyncDisposableStack): Promise<Owner> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL, CORPUS_ALTERNATE_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
    completion: () => {
      throw new Error("a memory scope with no summarizer must not request a summary");
    },
  });
  const root = stack.use(await createServerHarness({ providerFetch: physical.execute, startJobs: false }));
  const principal = await root.principalFor((await root.actor()).id);
  const caller = await root.internalCallerFor(principal.userId);
  await seedCorpusConnections(root, principal);
  await root.services.connection.setBinding({ principal, task: "summarize", connectionId: null });
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "lighthouse-keeper", name: "Bryn", description: "A lighthouse keeper." }),
  });
  const { chat } = await caller.chat.startChat({ characterIds: [card.id], opening: "none" });
  for (let scene = 0; scene < AGED_MESSAGES; scene += 1) {
    await caller.chat.commitMessage({ chatId: chat.id, content: `The keeper logs the lighthouse scene ${scene}.`, timeZone: UTC_TIME_ZONE });
  }
  return { root, principal, caller, cardId: card.id, chatId: chat.id };
}

async function runSweeps(owner: Owner, inputs: readonly Parameters<Owner["caller"]["workloads"]["start"]>[0]["input"][]): Promise<void> {
  for (const input of inputs) {
    const job = await owner.caller.workloads.start({ input, mode: "singular" });
    await executeAdmitted(owner.root, job.id);
    await expect.poll(async () => (await owner.caller.workloads.get({ id: job.id })).status).toBe("succeeded");
  }
  await owner.root.settleBackground();
}

async function searchHits(owner: Owner): Promise<readonly string[]> {
  const answer = await owner.caller.search.search({ query: "a lighthouse keeper", over: "entities", scope: { kind: "owner" }, topN: 3, rerank: false });
  if (answer.over !== "entities") {
    throw new Error("the card search returned the wrong result arm");
  }
  return answer.hits.map(({ characterId }) => characterId);
}

test("memory on with no summarize connection embeds segments, makes no digest, completes the scope, and search answers", async () => {
  await using stack = new AsyncDisposableStack();
  const owner = await ownerWithAgedRoom(stack);

  await runSweeps(owner, [
    { kind: "index", params: { source: "all" } },
    { kind: "memory-backfill", params: {} },
    { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
  ]);

  expect((await owner.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, owner.chatId))).length).toBeGreaterThan(0);
  expect(await owner.root.db.select().from(chatDigests).where(eq(chatDigests.chatId, owner.chatId))).toEqual([]);
  expect(await owner.caller.search.spaceStatus()).toEqual({ paused: false, embed: false, imageEmbed: false });
  expect(await searchHits(owner)).toContain(owner.cardId);
});

test("memory off after an encoder move drops the old-model segments, completes the scope, and search answers", async () => {
  await using stack = new AsyncDisposableStack();
  const owner = await ownerWithAgedRoom(stack);
  await runSweeps(owner, [
    { kind: "index", params: { source: "all" } },
    { kind: "memory-backfill", params: {} },
  ]);
  expect((await owner.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, owner.chatId))).length).toBeGreaterThan(0);

  await owner.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  const other = await seedAlternateEmbedder(owner.root, owner.principal);
  await owner.root.services.connection.setBinding({ principal: owner.principal, task: "embed", connectionId: other.id });
  await owner.root.settleBackground();
  const queued = (await owner.caller.workloads.list({})).filter((row) => row.status === "queued");
  expect(queued.length).toBeGreaterThan(0);
  for (const row of queued) {
    await executeAdmitted(owner.root, row.id);
  }
  await owner.root.settleBackground();

  expect(await owner.root.db.select().from(chatSegments).where(eq(chatSegments.chatId, owner.chatId))).toEqual([]);
  expect(await owner.caller.search.spaceStatus()).toEqual({ paused: false, embed: false, imageEmbed: false });
  expect(await searchHits(owner)).toContain(owner.cardId);
});
