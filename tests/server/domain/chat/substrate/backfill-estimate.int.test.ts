// @subject packages/server/src/domain/chat/substrate/backfill-estimate.ts
// @subject packages/server/src/domain/chat/substrate/backfill.ts
// The confirm's call count, asked through the workloads door, against the summarize calls the real sweep then makes:
// the two must agree, the count falls to zero once a chat is built, an edit makes its block count again, and an
// import window narrows both to the chats that import wrote.
import { createCharacterSchema } from "@orb/contracts/character";
import type { ImportWindow } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  SUMMARIZE_TRANSCRIPT_MARKER,
  seedTranscript,
} from "@orb/testkit/node/composed";

// The memory build's tier-0 prompt: one marker, one summarize call per block.
const BLOCK_SIZE = 2;

const lines = (count: number, tag: string): { readonly role: "assistant"; readonly content: string }[] =>
  Array.from({ length: count }, (_, index) => ({ role: "assistant" as const, content: `${tag} scene ${index + 1}: ${"orbital ledger ballast ".repeat(40)}` }));

interface MemoryRoom {
  readonly h: ChatRoot;
  readonly summaries: () => number;
}

async function memoryRoom(options: { readonly transcript?: number; readonly characters?: readonly string[] } = {}): Promise<MemoryRoom & AsyncDisposable> {
  let summarized = 0;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body): string => {
      if (body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
        summarized += 1;
        return "An earlier ledger scene\nThe keeper remembers the earlier orbital ledger scene.\nKeywords: ledger";
      }
      return "The keeper nods.";
    },
  });
  const h = await createChatRoot({
    server: { startJobs: false },
    providerFetch: physical.execute,
    memoryEnabled: true,
    memoryDefaults: { mode: "mixC", blockSize: BLOCK_SIZE, verbatimWindow: 0, maxTier: 0 },
    characters: (options.characters ?? ["iris"]).map((name) => createCharacterSchema.parse({ handle: name, name, description: `${name} keeps the ledger.` })),
    transcript: lines(options.transcript ?? 8, "Earlier"),
  });
  return { h, summaries: () => summarized, [Symbol.asyncDispose]: () => h[Symbol.asyncDispose]() };
}

async function estimate(h: ChatRoot, importWindow?: ImportWindow, mode: "singular" | "bulk" = "singular"): Promise<number> {
  const params = importWindow === undefined ? {} : { importWindow };
  const { calls } = await h.caller.workloads.estimateModelCalls({ input: { kind: "memory-backfill", params }, mode });
  if (calls === null) {
    throw new Error("the memory backfill has no model-call estimate");
  }
  return calls;
}

/** Run the real memory sweep to its terminal state and return the summarize calls it spent. */
async function sweep(room: MemoryRoom, importWindow?: ImportWindow): Promise<number> {
  const { h } = room;
  const run = h.root.runAdmittedWorkload;
  if (run === undefined) {
    throw new Error("the composed root has no admitted-workload driver");
  }
  const before = room.summaries();
  const params = importWindow === undefined ? {} : { importWindow };
  const job = await h.caller.workloads.start({ input: { kind: "memory-backfill", params }, mode: "singular" });
  const lifetime = new AbortController();
  try {
    await run(job.id, lifetime.signal);
  } finally {
    lifetime.abort();
  }
  expect((await h.caller.workloads.get({ id: job.id })).status).toBe("succeeded");
  return room.summaries() - before;
}

test("the estimate is the summarize calls the sweep makes, and nothing once the chat is built", async () => {
  await using room = await memoryRoom();
  const counted = await estimate(room.h);
  // Eight aged-out turns in blocks of two: four tier-0 summaries.
  expect(counted).toBe(4);
  expect(await sweep(room)).toBe(counted);
  expect(await estimate(room.h)).toBe(0);
});

test("an edit to a built block is counted again, and the sweep rebuilds exactly that block", async () => {
  await using room = await memoryRoom();
  await sweep(room);
  expect(await estimate(room.h)).toBe(0);
  const first = (await room.h.root.services.chat.listMessages({ principal: room.h.owner, chatId: room.h.chatId })).messages[0];
  if (first === undefined) {
    throw new Error("the imported room has no first message");
  }
  await room.h.root.services.chat.editMessage({ principal: room.h.owner, chatId: room.h.chatId, messageId: first.id, content: "rewritten first scene" });

  const counted = await estimate(room.h);
  expect(counted).toBe(1);
  expect(await sweep(room)).toBe(counted);
});

test("a late-seated character is counted only for the blocks it witnessed, exactly as the sweep builds them", async () => {
  await using room = await memoryRoom();
  const { h } = room;
  const bryn = await h.root.services.character.create({
    principal: h.owner,
    input: createCharacterSchema.parse({ handle: "bryn", name: "bryn", description: "bryn arrives late." }),
  });
  await h.root.services.chat.addCharacterToChat({ principal: h.owner, chatId: h.chatId, characterId: bryn.id });
  const counted = await estimate(h);
  // The shared group bucket and the first seat hold all four blocks; the second seat joined after them, so it holds fewer than four.
  // Shared bucket 4 and first seat 4; the late seat holds the one block that spans its join.
  expect(counted).toBe(9);
  expect(await sweep(room)).toBe(counted);
  expect(await estimate(h)).toBe(0);
});

test("a group room counts its unminted shared bucket and mints nothing; a host with memory off costs nothing", async () => {
  await using room = await memoryRoom({ characters: ["iris", "bryn"], transcript: 4 });
  const { h } = room;
  const shared = (): ReturnType<ChatRoot["root"]["services"]["character"]["findSyntheticGroupCharacter"]> =>
    h.root.services.character.findSyntheticGroupCharacter({ ownerId: h.owner.userId, chatId: h.chatId });
  expect(await shared()).toBeNull();
  const counted = await estimate(h);
  expect(counted).toBeGreaterThan(0);
  expect(await shared()).toBeNull();

  // The bulk sweep resolves each host's own memory setting, so only the bulk count reaches the per-host off check.
  expect(await estimate(h, undefined, "bulk")).toBe(counted);
  await h.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  expect(await estimate(h)).toBe(0);
  expect(await estimate(h, undefined, "bulk")).toBe(0);
});

test("an import window counts only the host's chats imported in the span, and the scoped sweep builds exactly those", async () => {
  await using room = await memoryRoom({ transcript: 4 });
  const { h } = room;
  const handle = h.characters[0]?.handle;
  if (handle === undefined) {
    throw new Error("the room seated no character");
  }
  // The room's own import happened at the frozen clock; every later import is stamped after an advance.
  const imported = h.root.clock.now();
  const windowOfFirst: ImportWindow = { from: imported, to: imported };
  h.root.clock.advance(60_000);
  await seedTranscript(h.root, { ownerId: h.owner.userId, characterHandles: [handle], lines: lines(4, "Second") });

  const everything = await estimate(h);
  const scoped = await estimate(h, windowOfFirst);
  // Four aged-out turns per room in blocks of two: two summaries each.
  expect(everything).toBe(4);
  expect(scoped).toBe(2);
  expect(await sweep(room, windowOfFirst)).toBe(scoped);
  // The scoped run built the first room only; the later import is still unbuilt.
  expect(await estimate(h)).toBe(2);
});
