// @subject packages/db/src/migrations/0006_bookmark-checkpoint-snapshots.sql
// A launched room whose checkpoint pinned a turn snapshot keeps its current state through the migration, can
// delete that turn afterwards, and still restores the bookmark.
import { assertReferentialIntegrity, closeDb, createDb, runMigrations } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  migrationsBefore,
  plantTurnPinnedCheckpoint,
  SHIPPED_MIGRATIONS,
  seedCorpusActors,
  seedRecallRoom,
} from "@orb/testkit/node/composed";

const MIGRATION = "0006_bookmark-checkpoint-snapshots";
const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };
const SAVED_LOCATION = "Bookmarked observatory";
const LATER_LOCATION = "Later observatory";
const SWIPED_LOCATION = "Swiped observatory";
const LABEL = "Before the storm";

type Params = Parameters<ServerTestHarness["services"]["chat"]["send"]>[0];
type AssistantSlot = Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>["messages"][number];

interface LegacyRoom {
  readonly root: ServerTestHarness;
  readonly params: Pick<Params, "principal" | "chatId">;
  readonly send: (content: string) => Promise<AssistantSlot>;
  readonly migrate: () => Promise<void>;
}

/** A composed root over a database on the chain cut before 0006; `migrate` runs the shipped chain over it. */
async function legacyRoom(ownership: AsyncDisposableStack): Promise<LegacyRoom> {
  const previousChain = ownership.use(await migrationsBefore(MIGRATION)).path;
  const db = await createDb(":memory:");
  ownership.defer(() => closeDb(db));
  await runMigrations(db, previousChain);
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
    await runMigrations(db, SHIPPED_MIGRATIONS);
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
  const planted = await plantTurnPinnedCheckpoint(room.root, {
    gameId,
    turns: [
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
  expect(checkpoint?.snapshotId).not.toBe(planted.snapshotIds[0]);

  await room.root.services.chat.deleteMessages({ ...room.params, messageIds: [bookmarked.id] });
  expect((await room.root.services.chat.listMessages(room.params)).messages.map((message) => message.id)).not.toContain(bookmarked.id);
  await room.root.services.rpg.restoreCheckpoint({ ...room.params, checkpointId: planted.checkpointId });
  expect(await location(room)).toBe(SAVED_LOCATION);
});

test("a checkpoint pinned to a swiped-away variant re-pins without taking the room's state from the selected swipe", async () => {
  await using ownership = new AsyncDisposableStack();
  const room = await legacyRoom(ownership);
  const first = await room.send("Enter the observatory.");
  expect((await room.root.services.chat.swipe({ ...room.params, messageId: first.id, intent: INTENT })).aborted).toBe(false);
  await room.root.settleBackground();
  const swiped = (await room.root.services.chat.listMessages(room.params)).messages.find((message) => message.id === first.id);
  if (swiped === undefined || swiped.selectedVariantId === first.selectedVariantId) {
    throw new Error("the swipe selected no new variant");
  }
  const { gameId } = await room.root.services.rpg.createGame({ ...room.params, mode: "lite" });
  const at = room.root.clock.now();
  const planted = await plantTurnPinnedCheckpoint(room.root, {
    gameId,
    turns: [
      { messageId: first.id, variantId: first.selectedVariantId, location: SAVED_LOCATION, createdAt: at },
      { messageId: first.id, variantId: swiped.selectedVariantId, location: SWIPED_LOCATION, createdAt: at },
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
