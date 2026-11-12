// @subject packages/db/src/migrations/0006_bookmark-checkpoint-snapshots.sql
// A launched room whose checkpoint pinned a turn snapshot keeps its current state through the migration, can
// delete that turn afterwards, and still restores the bookmark.
import { assertReferentialIntegrity, createDb, runMigrations } from "@orb/db";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  migrationsHolding,
  ownDb,
  plantLegacyCheckpoint,
  seedCorpusActors,
  seedRecallRoom,
} from "@orb/testkit/node/composed";

const MIGRATION = "0006_bookmark-checkpoint-snapshots";
const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };
const SAVED_LOCATION = "Bookmarked observatory";
const LATER_LOCATION = "Later observatory";
const SWIPED_LOCATION = "Swiped observatory";
const LABEL = "Before the storm";
const HAND_LOCATION = "Hand-edited observatory";
// A real hand edit that v0.3.x reused as the checkpoint target, made a minute before the checkpoint.
const EDIT_BEFORE_CHECKPOINT_MS = 60_000;

type Params = Parameters<ServerTestHarness["services"]["chat"]["send"]>[0];
type AssistantSlot = Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>["messages"][number];

interface LegacyRoom {
  readonly root: ServerTestHarness;
  readonly params: Pick<Params, "principal" | "chatId">;
  readonly send: (content: string) => Promise<AssistantSlot>;
  readonly migrate: () => Promise<void>;
}

/** A composed root over a database that holds every migration but 0006; `migrate` then applies 0006. */
async function legacyRoom(ownership: AsyncDisposableStack): Promise<LegacyRoom> {
  const { rest, held } = ownership.use(await migrationsHolding(MIGRATION)).paths;
  const db = ownership.use(ownDb(await createDb(":memory:"))).db;
  await runMigrations(db, rest);
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller studies the observatory.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = ownership.use(await createServerHarness({ db, providerFetch: wire.execute }));
  const actors = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(root.ownerId));
  const params = { principal: actors.owner, chatId };
  const send = async (content: string): Promise<AssistantSlot> => {
    const turn = await root.services.chat.send({ ...params, content, intent: INTENT });
    const assistant = turn.messages.find((message) => message.role === "assistant");
    if (assistant === undefined) {
      throw new Error("the turn produced no assistant slot");
    }
    return assistant;
  };
  const migrate = async (): Promise<void> => {
    await runMigrations(db, held);
    await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  };
  return { root, params, send, migrate };
}

const location = async (room: LegacyRoom): Promise<string | undefined> => (await room.root.services.rpg.getTrackerView(room.params)).ambient?.location;

test("a turn-pinned checkpoint from before v0.3.0 re-pins to a bookmark: the room keeps its state, the turn deletes, the bookmark restores", async () => {
  await using ownership = new AsyncDisposableStack();
  const room = await legacyRoom(ownership);
  const bookmarked = await room.send("Enter the observatory.");
  const later = await room.send("Wait for the storm.");
  await room.root.settleBackground();
  const { gameId } = await room.root.services.rpg.createGame({ ...room.params, mode: "lite" });
  const at = room.root.clock.now();
  const planted = await plantLegacyCheckpoint(room.root, {
    gameId,
    rows: [
      { messageId: bookmarked.id, variantId: bookmarked.selectedVariantId, location: SAVED_LOCATION, createdAt: at },
      { messageId: later.id, variantId: later.selectedVariantId, location: LATER_LOCATION, createdAt: at },
    ],
    pinned: 0,
    label: LABEL,
    at,
  });

  await room.migrate();

  expect(await location(room)).toBe(LATER_LOCATION);
  const [checkpoint, ...others] = await room.root.services.rpg.listCheckpoints(room.params);
  expect(others).toEqual([]);
  expect(checkpoint).toMatchObject({ id: planted.checkpointId, label: LABEL });
  expect(present(checkpoint).snapshotId).not.toBe(planted.snapshotIds[0]);

  await room.root.services.chat.deleteMessages({ ...room.params, messageIds: [bookmarked.id] });
  expect((await room.root.services.chat.listMessages(room.params)).messages.map((message) => message.id)).not.toContain(bookmarked.id);
  await room.root.services.rpg.restoreCheckpoint({ ...room.params, checkpointId: planted.checkpointId });
  expect(await location(room)).toBe(SAVED_LOCATION);
});

interface SwipedTurn {
  readonly turn: AssistantSlot;
  readonly swipedVariantId: AssistantSlot["selectedVariantId"];
  readonly gameId: Parameters<typeof plantLegacyCheckpoint>[1]["gameId"];
}

/** One assistant turn swiped to a second variant, then a game born on the room: the pre-0006 production steps. */
async function swipedTurn(room: LegacyRoom): Promise<SwipedTurn> {
  const turn = await room.send("Enter the observatory.");
  expect((await room.root.services.chat.swipe({ ...room.params, messageId: turn.id, intent: INTENT })).aborted).toBe(false);
  await room.root.settleBackground();
  const swiped = (await room.root.services.chat.listMessages(room.params)).messages.find((message) => message.id === turn.id);
  if (swiped === undefined || swiped.selectedVariantId === turn.selectedVariantId) {
    throw new Error("the swipe selected no new variant");
  }
  const { gameId } = await room.root.services.rpg.createGame({ ...room.params, mode: "lite" });
  return { turn, swipedVariantId: swiped.selectedVariantId, gameId };
}

test("a checkpoint pinned to a swiped-away variant re-pins without taking the room's state from the selected swipe", async () => {
  await using ownership = new AsyncDisposableStack();
  const room = await legacyRoom(ownership);
  const { turn, swipedVariantId, gameId } = await swipedTurn(room);
  const at = room.root.clock.now();
  const planted = await plantLegacyCheckpoint(room.root, {
    gameId,
    rows: [
      { messageId: turn.id, variantId: turn.selectedVariantId, location: SAVED_LOCATION, createdAt: at },
      { messageId: turn.id, variantId: swipedVariantId, location: SWIPED_LOCATION, createdAt: at },
    ],
    pinned: 0,
    label: LABEL,
    at,
  });

  await room.migrate();

  expect(await location(room)).toBe(SWIPED_LOCATION);
  await room.root.services.rpg.restoreCheckpoint({ ...room.params, checkpointId: planted.checkpointId });
  expect(await location(room)).toBe(SAVED_LOCATION);
});

test("a v0.3.x checkpoint copy, a hand row created with its checkpoint, becomes the bookmark, so the later swipe shows", async () => {
  await using ownership = new AsyncDisposableStack();
  const room = await legacyRoom(ownership);
  const { turn, swipedVariantId, gameId } = await swipedTurn(room);
  const at = room.root.clock.now();
  // v0.3.x copied the head turn into a committed hand row at the chat tail, created at the checkpoint's own time.
  const planted = await plantLegacyCheckpoint(room.root, {
    gameId,
    rows: [
      { messageId: turn.id, variantId: turn.selectedVariantId, location: SAVED_LOCATION, createdAt: at },
      { messageId: turn.id, variantId: swipedVariantId, location: SWIPED_LOCATION, createdAt: at },
      { asOfMessageId: turn.id, location: SAVED_LOCATION, createdAt: at },
    ],
    pinned: 2,
    label: LABEL,
    at,
  });

  await room.migrate();

  expect(await location(room)).toBe(SWIPED_LOCATION);
  const [checkpoint] = await room.root.services.rpg.listCheckpoints(room.params);
  expect(checkpoint?.snapshotId).toBe(planted.snapshotIds[2]);
  await room.root.services.rpg.restoreCheckpoint({ ...room.params, checkpointId: planted.checkpointId });
  expect(await location(room)).toBe(SAVED_LOCATION);
});

test("a checkpoint pinned to an earlier hand edit keeps that edit as the room's state and gets its own bookmark", async () => {
  await using ownership = new AsyncDisposableStack();
  const room = await legacyRoom(ownership);
  const { turn, swipedVariantId, gameId } = await swipedTurn(room);
  const at = room.root.clock.now();
  const planted = await plantLegacyCheckpoint(room.root, {
    gameId,
    rows: [
      { messageId: turn.id, variantId: swipedVariantId, location: SWIPED_LOCATION, createdAt: at },
      { asOfMessageId: turn.id, location: HAND_LOCATION, createdAt: at - EDIT_BEFORE_CHECKPOINT_MS },
    ],
    pinned: 1,
    label: LABEL,
    at,
  });

  await room.migrate();

  expect(await location(room)).toBe(HAND_LOCATION);
  const [checkpoint] = await room.root.services.rpg.listCheckpoints(room.params);
  expect(present(checkpoint).snapshotId).not.toBe(planted.snapshotIds[1]);
  await room.root.services.rpg.restoreCheckpoint({ ...room.params, checkpointId: planted.checkpointId });
  expect(await location(room)).toBe(HAND_LOCATION);
});
