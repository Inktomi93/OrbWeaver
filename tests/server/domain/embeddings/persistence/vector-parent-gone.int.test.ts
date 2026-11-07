// A vector whose parent is deleted while its text is being embedded lands nowhere and fails nothing: an embed can
// outlast the row it was asked for, and the write that follows must read that as the end of the work, not as a fault.
// @subject packages/server/src/domain/embeddings/persistence/queries.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { EMBEDDING_FLOOR } from "@orb/contracts/inference";
import { characterEmbeddings, characters, chatDigestSpeakers, chatDigests, chatSegments, chats, documentChunks, documents } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import { sha256Hex } from "@orb/server/primitives/content-hash";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, createCorpusProviderExecution, createServerHarness } from "@orb/testkit/node/composed";
import { eq, inArray } from "drizzle-orm";

const ENDPOINT = "https://inference.test/v1";
const SUPERVISED_FAILURE = "detached operation failed";
const LOG_SCAN_LIMIT = 100;

type StoreParams = Parameters<ServerTestHarness["app"]["embeddings"]["store"]>[0];

interface EmbedEdge {
  readonly options: Parameters<typeof createServerHarness>[0];
  /** Run `work` while the next embed request is in flight, before the provider answers it. */
  readonly whileEmbedding: (work: () => Promise<unknown>) => void;
}

function embedEdge(): EmbedEdge {
  const physical = createCorpusProviderExecution({
    baseUrl: ENDPOINT,
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  let pending: (() => Promise<unknown>) | null = null;
  const execute: typeof physical.execute = async (...args) => {
    const work = pending;
    pending = null;
    await work?.();
    return await physical.execute(...args);
  };
  return {
    options: {
      providerFetch: execute,
      networkExecution: {
        resolver: (hostname): Promise<string[]> =>
          hostname === new URL(ENDPOINT).hostname ? Promise.resolve([PUBLIC_PEER_ADDRESS]) : Promise.reject(new Error("unscripted embed provider hostname")),
      },
    },
    whileEmbedding: (work): void => {
      pending = work;
    },
  };
}

async function bindEmbedder(root: ServerTestHarness): Promise<Awaited<ReturnType<ServerTestHarness["principalFor"]>>> {
  const host = await root.principalFor(root.ownerId);
  const connection = await root.services.connection.create({
    principal: host,
    providerId: "lm-studio",
    credentialId: null,
    baseUrl: ENDPOINT,
    model: CORPUS_EMBED_MODEL,
    allowBackground: true,
    declared: { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, dims: CORPUS_EMBEDDING_VECTOR.length } },
  });
  await root.services.connection.setBinding({ principal: host, task: "embed", connectionId: connection.id });
  return host;
}

async function embedSpace(root: ServerTestHarness, ownerId: UserId): Promise<{ readonly space: string }> {
  const generation = await root.app.embeddings.resolveGeneration(ownerId, "embed");
  if (generation === null) {
    throw new Error("the real host binding did not resolve an embedding generation");
  }
  return generation;
}

function digestOf(args: {
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly scoped: CharacterId;
  readonly speakers: readonly CharacterId[];
  readonly model: string;
  readonly blockIdx: number;
}): StoreParams {
  const text = `[archive — hall]\nBlock ${args.blockIdx}`;
  return {
    lens: "digest",
    ownerId: args.ownerId,
    chatId: args.chatId,
    scopedCharacterId: args.scoped,
    isGroup: false,
    tier: 0,
    blockIdx: args.blockIdx,
    text,
    topicAnchor: "[archive — hall]",
    keywords: ["archive"],
    speakerCharacterIds: args.speakers,
    contentHash: sha256Hex(text),
    model: args.model,
  };
}

async function startRoom(
  root: ServerTestHarness,
  host: Awaited<ReturnType<typeof bindEmbedder>>,
  handle: string,
): Promise<{ characterId: CharacterId; chatId: ChatId }> {
  const character = await root.services.character.create({
    principal: host,
    input: createCharacterSchema.parse({ handle, name: `Witness ${handle}`, description: "The witness outlives the embed, or does not." }),
  });
  const { chat } = await root.services.chat.startChat({ principal: host, characterIds: [character.id] });
  await root.settleBackground();
  return { characterId: character.id, chatId: chat.id };
}

test("a card deleted during its own embed settles quietly, and a card that stays takes its vector", async () => {
  const edge = embedEdge();
  await using root = await createServerHarness({ ...edge.options, logLevel: "error" });
  const host = await bindEmbedder(root);
  await root.services.settings.updateAppSettings({ principal: host, partial: { corpusAutoindex: true } });
  await root.settleBackground();
  const card = (handle: string): ReturnType<typeof createCharacterSchema.parse> =>
    createCharacterSchema.parse({ handle, name: `Card ${handle}`, description: "A card with embeddable text." });

  const kept = await root.services.character.create({ principal: host, input: card("kept-card") });
  await root.settleBackground();
  expect((await root.db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, kept.id))).length).toBe(1);

  const created = Promise.withResolvers<CharacterId>();
  edge.whileEmbedding(async () => await root.services.character.remove({ principal: host, characterId: await created.promise }));
  const removed = await root.services.character.create({ principal: host, input: card("removed-card") });
  created.resolve(removed.id);
  await root.settleBackground();

  expect(await root.db.select().from(characters).where(eq(characters.id, removed.id))).toEqual([]);
  expect(await root.db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, removed.id))).toEqual([]);
  expect(root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(SUPERVISED_FAILURE))).toEqual([]);
});

test("a digest lands nothing once its chat or its scoped character is gone, and drops only a speaker who vanished", async () => {
  const edge = embedEdge();
  await using root = await createServerHarness(edge.options);
  const host = await bindEmbedder(root);
  const { space } = await embedSpace(root, host.userId);
  const room = await startRoom(root, host, "digest-room");
  const rows = async (chatId: ChatId): Promise<readonly number[]> =>
    (await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId))).map(({ blockIdx }) => blockIdx);

  // Control: with every parent present the digest and its speaker land.
  const digest = (blockIdx: number, chatId: ChatId, scopedId: CharacterId, speakerIds: readonly CharacterId[]): StoreParams =>
    digestOf({ ownerId: host.userId, chatId, scoped: scopedId, speakers: speakerIds, model: space, blockIdx });
  expect((await root.app.embeddings.store(digest(0, room.chatId, room.characterId, [room.characterId]))).outcome).toBe("written");
  expect(await rows(room.chatId)).toEqual([0]);

  // A speaker deleted mid-embed leaves the digest standing without that speaker, as the cascade would have.
  const speaker = await startRoom(root, host, "digest-speaker");
  edge.whileEmbedding(async () => await root.db.delete(characters).where(eq(characters.id, speaker.characterId)));
  expect((await root.app.embeddings.store(digest(1, room.chatId, room.characterId, [room.characterId, speaker.characterId]))).outcome).toBe("written");
  const landed = await root.db.select({ id: chatDigests.id }).from(chatDigests).where(eq(chatDigests.chatId, room.chatId));
  const speakers = await root.db
    .select({ characterId: chatDigestSpeakers.characterId })
    .from(chatDigestSpeakers)
    .where(
      inArray(
        chatDigestSpeakers.digestId,
        landed.map(({ id }) => id),
      ),
    );
  expect(speakers.map(({ characterId }) => characterId)).toEqual([room.characterId, room.characterId]);
  expect(await rows(room.chatId)).toEqual([0, 1]);

  // The scoped character gone mid-embed: no row, no throw.
  const scoped = await startRoom(root, host, "digest-scoped");
  edge.whileEmbedding(async () => await root.db.delete(characters).where(eq(characters.id, scoped.characterId)));
  expect((await root.app.embeddings.store(digest(0, room.chatId, scoped.characterId, []))).outcome).toBe("noop");
  expect(await rows(room.chatId)).toEqual([0, 1]);

  // The chat gone mid-embed: no row, no throw.
  edge.whileEmbedding(async () => await root.db.delete(chats).where(eq(chats.id, room.chatId)));
  expect((await root.app.embeddings.store(digest(2, room.chatId, room.characterId, [room.characterId]))).outcome).toBe("noop");
  expect(await rows(room.chatId)).toEqual([]);
});

test("a verbatim segment lands nothing once its chat is gone", async () => {
  const edge = embedEdge();
  await using root = await createServerHarness(edge.options);
  const host = await bindEmbedder(root);
  const { space } = await embedSpace(root, host.userId);
  const room = await startRoom(root, host, "segment-room");
  const segment = (blockIdx: number): Parameters<ServerTestHarness["app"]["embeddings"]["storeSegments"]>[0][number] => {
    const text = `A verbatim block ${blockIdx}.`;
    return {
      lens: "segment",
      ownerId: host.userId,
      chatId: room.chatId,
      blockIdx,
      chunkIdx: 0,
      seqStart: 0,
      seqEnd: 1,
      text,
      contentHash: sha256Hex(text),
      model: space,
    };
  };
  const rows = async (): Promise<readonly number[]> =>
    (await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, room.chatId))).map(({ blockIdx }) => blockIdx);

  expect((await root.app.embeddings.storeSegments([segment(0)])).map(({ outcome }) => outcome)).toEqual(["written"]);
  expect(await rows()).toEqual([0]);

  edge.whileEmbedding(async () => await root.db.delete(chats).where(eq(chats.id, room.chatId)));
  expect((await root.app.embeddings.storeSegments([segment(1)])).map(({ outcome }) => outcome)).toEqual(["noop"]);
  expect(await rows()).toEqual([]);
});

test("a document chunk lands nothing once its document is gone", async () => {
  const edge = embedEdge();
  await using root = await createServerHarness(edge.options);
  const host = await bindEmbedder(root);
  const { space } = await embedSpace(root, host.userId);
  const { document } = await root.services.databank.createFromText({ principal: host, name: "gone document", text: "A document the reader deletes." });
  await root.settleBackground();
  await root.db.delete(documentChunks).where(eq(documentChunks.documentId, document.id));
  const chunk = (chunkIdx: number): StoreParams => ({
    lens: "chunk",
    ownerId: host.userId,
    content: `A document slice ${chunkIdx}.`,
    model: space,
    fkRefs: { documentId: document.id, chunkIdx, charStart: 0, charEnd: 1 },
  });
  const rows = async (): Promise<readonly number[]> =>
    (await root.db.select().from(documentChunks).where(eq(documentChunks.documentId, document.id))).map(({ chunkIdx }) => chunkIdx);

  expect((await root.app.embeddings.store(chunk(0))).outcome).toBe("written");
  expect(await rows()).toEqual([0]);

  edge.whileEmbedding(async () => await root.db.delete(documents).where(eq(documents.id, document.id)));
  expect((await root.app.embeddings.store(chunk(1))).outcome).toBe("noop");
  expect(await rows()).toEqual([]);
});
