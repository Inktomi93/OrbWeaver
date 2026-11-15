// A greeting or an edit is a write the request commits whole, so the save pass on it never fails on retrieval. When no
// save script the pass runs reads `{{memory}}` or `{{databank}}`, the write gathers neither and embeds nothing; when one
// does, retrieval runs and a refused embed reads as an empty slot. With the embedder up, the macro renders what the
// databank retrieved. A turn keeps its strict gather: a refused embed still fails the turn.
// @subject packages/server/src/domain/chat/assembly/gather.ts
// @subject packages/server/src/domain/chat/substrate/greeting-regex.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
  seedGlobalRegexScript,
  seedRegexScript,
} from "@orb/testkit/node/composed";

const SWEEP_STEP_MS = 2000;
const TAIL = 10;
const EMBED_PATH = "/embeddings";
const LORE = "The ledger room keeps its brass lanterns trimmed.";
const REFUSED = { status: 400, body: JSON.stringify({ error: { message: "embedding refused", type: "invalid_request_error" } }) };

interface SaveRoom extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
  readonly keeperId: CharacterId;
  readonly guestId: CharacterId;
  /** Embedding requests the provider has received, refused ones included. */
  readonly embeds: () => number;
  readonly refuseEmbeds: (refusing: boolean) => void;
  readonly attachLore: (chatId: ChatId) => Promise<void>;
}

// The owner hosts. Their settled embedding space holds one indexed document, so a databank read in a room the
// document is attached to embeds its query. The provider answers every embed until the case turns refusal on.
async function saveRoom(replaceString: string): Promise<SaveRoom> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  let embeds = 0;
  let refusing = false;
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).pathname.endsWith(EMBED_PATH)) {
          embeds += 1;
          if (refusing) {
            return new Response(REFUSED.body, { status: REFUSED.status, headers: { "content-type": "application/json" } });
          }
        }
        return await physical.execute(request);
      },
    }),
  );
  const { owner } = await seedCorpusActors(root);
  const caller = await root.internalCallerFor(owner.userId);
  const script = await seedRegexScript(root, {
    principal: owner,
    input: createRegexScriptSchema.parse({
      name: "lamp to lantern",
      findRegex: "lamp",
      replaceString,
      targets: ["AI_OUTPUT"],
      passes: ["save"],
      runOnEdit: true,
    }),
  });
  await seedGlobalRegexScript(root, { principal: owner, scriptId: script.id });
  const card = async (handle: string, name: string, greetings: readonly string[]): Promise<CharacterId> =>
    (
      await caller.character.create({
        input: createCharacterSchema.parse({ handle, name, description: `${name} tends the room.`, greetings: greetings.map((text) => ({ text })) }),
      })
    ).id;
  const keeperId = await card("save-keeper", "Keeper", ["The lamp is lit.", "A lamp gutters."]);
  const guestId = await card("save-guest", "Guest", ["The guest lifts a lamp."]);

  const lore = await root.services.databank.createFromText({ signal: new AbortController().signal, principal: owner, name: "room-lore.txt", text: LORE });
  const ingested = await root.app.databankIngest.ingestDocument({ documentId: lore.document.id, signal: new AbortController().signal });
  expect(ingested.chunksUpserted).toBeGreaterThan(0);
  // The owner's space settles through its own sweeps; the memory sweep refuses an owner with Memory off.
  await caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, maxTier: 0 } } });
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const sweeps = [
    await caller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  await expect
    .poll(async () => {
      root.timers.advance(SWEEP_STEP_MS);
      const jobs = (await caller.workloads.list()).filter((job) => sweeps.some((sweep) => sweep.id === job.id));
      expect(jobs.filter((job) => job.status === "failed" || job.status === "cancelled")).toEqual([]);
      return jobs.length === sweeps.length && jobs.every((job) => job.status === "succeeded");
    })
    .toBe(true);
  const lifetime = construction.move();
  return {
    root,
    caller,
    keeperId,
    guestId,
    embeds: () => embeds,
    refuseEmbeds: (next): void => {
      refusing = next;
    },
    attachLore: async (chatId): Promise<void> => {
      await root.services.databank.attachToChat({ principal: owner, chatId, documentId: lore.document.id });
    },
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

interface SaveWrites {
  readonly started: string;
  readonly stepped: string;
  readonly joined: string;
  readonly edited: string;
  /** Embeds each write sent, in the order above. */
  readonly embedsPerWrite: readonly number[];
}

// The four greeting and edit writes, each read back through the room's transcript: the opening greeting, a step to
// the card's alternate, a character added while the greeting window is open, and an edit of the greeting.
async function runSaveWrites(room: SaveRoom): Promise<SaveWrites> {
  const { caller } = room;
  const embedsPerWrite: number[] = [];
  const write = async <T>(run: () => Promise<T>): Promise<T> => {
    const before = room.embeds();
    const result = await run();
    embedsPerWrite.push(room.embeds() - before);
    return result;
  };
  const stored = async (inChat: ChatId, characterId: CharacterId): Promise<string> => {
    const found = (await caller.chat.listMessages({ chatId: inChat, limit: TAIL })).messages.findLast((message) => message.characterId === characterId);
    if (found === undefined) {
      throw new Error("the write stored no row for the character");
    }
    return found.content;
  };
  const opened = await write(async () => await caller.chat.startChat({ characterIds: [room.keeperId], opening: "first-message" }));
  const chatId = opened.chat.id;
  const greeting = opened.opening?.messages[0];
  if (greeting === undefined) {
    throw new Error("the start seeded no greeting");
  }
  const started = await stored(chatId, room.keeperId);
  await room.attachLore(chatId);
  await write(async () => await caller.chat.setSeededGreeting({ chatId, messageId: greeting.id, greetingIndex: 1 }));
  const stepped = await stored(chatId, room.keeperId);
  await write(async () => await caller.chat.addCharacterToChat({ chatId, characterId: room.guestId }));
  const joined = await stored(chatId, room.guestId);
  await write(async () => await caller.chat.editMessage({ chatId, messageId: greeting.id, content: "The lamp burns low.", timeZone: UTC_TIME_ZONE }));
  const edited = await stored(chatId, room.keeperId);
  return { started, stepped, joined, edited, embedsPerWrite };
}

test("save scripts that read neither slot rewrite every greeting and edit while the embedder refuses, and embed nothing", async () => {
  await using room = await saveRoom("lantern");
  room.refuseEmbeds(true);
  expect(await runSaveWrites(room)).toEqual({
    started: "The lantern is lit.",
    stepped: "A lantern gutters.",
    joined: "The guest lifts a lantern.",
    edited: "The lantern burns low.",
    embedsPerWrite: [0, 0, 0, 0],
  });
});

test("a save script that reads the databank commits every write while the embedder refuses, with the slot empty", async () => {
  await using room = await saveRoom("lantern[{{databank}}]");
  room.refuseEmbeds(true);
  const writes = await runSaveWrites(room);
  expect(writes).toMatchObject({
    started: "The lantern[] is lit.",
    stepped: "A lantern[] gutters.",
    joined: "The guest lifts a lantern[].",
    edited: "The lantern[] burns low.",
  });
  // A fresh room has no transcript to query with, so the opening greeting embeds nothing; every later write asked.
  const [opening, ...later] = writes.embedsPerWrite;
  expect(opening).toBe(0);
  expect(nonEmpty(later).every((count) => count > 0)).toBe(true);
});

test("a save script that reads the databank renders the retrieved document while the embedder answers", async () => {
  await using room = await saveRoom("lantern[{{databank}}]");
  const writes = await runSaveWrites(room);
  expect(writes.started).toBe("The lantern[] is lit.");
  for (const text of [writes.stepped, writes.joined, writes.edited]) {
    expect(text).toContain(LORE);
  }
});

test("a turn with the embedder refusing still fails on its retrieval", async () => {
  await using room = await saveRoom("lantern");
  const opened = await room.caller.chat.startChat({ characterIds: [room.keeperId], opening: "first-message" });
  await room.attachLore(opened.chat.id);
  room.refuseEmbeds(true);
  const principal = await room.root.principalFor(room.root.ownerId);
  await expect(
    room.root.services.chat.send({
      principal,
      chatId: opened.chat.id,
      content: "What does the ledger say?",
      intent: { maxContextTokens: 4096, maxOutputTokens: 64 },
    }),
  ).rejects.toMatchObject({ message: expect.stringContaining("embedding refused") });
});
