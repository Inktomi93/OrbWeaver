// Checkpoints are immutable bookmarks: creating and restoring one leaves the rpg_snapshots and rpg_checkpoints
// rows it points at, and the canon rows, byte-for-byte as stored.
// @subject packages/server/src/domain/rpg/verbs/checkpoint/create-checkpoint.ts
// @subject packages/server/src/domain/rpg/verbs/checkpoint/restore-checkpoint.ts
// @subject packages/server/src/domain/rpg/persistence/checkpoints.ts
// @subject packages/server/src/domain/rpg/persistence/snapshots.ts
// @subject packages/server/src/domain/rpg/snapshot-edit.ts

import { declaredCapabilitySchema } from "@orb/contracts/inference";
import { RPG_LITE_TOOL_NAMES, RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import { closeDb, messages, rpgCheckpoints, rpgSnapshots } from "@orb/db";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, RpgGameId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  refuseWrites,
  seedCorpusActors,
  seedRecallRoom,
} from "@orb/testkit/node/composed";
import { captureRpgSnapshot, seedRpgCheckpointRows, seedRpgGameRows } from "@orb/testkit/node/rows";
import { eq, getTableName } from "drizzle-orm";

const INTENT = { maxContextTokens: 32_000, maxOutputTokens: 128 };
const SAVED_LOCATION = "Bookmarked observatory";
const EDITED_LOCATION = "Later observatory";

interface FoldedScene extends Awaited<ReturnType<typeof seedCorpusActors>> {
  readonly caller: Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
  readonly chatId: ChatId;
  readonly game: Awaited<ReturnType<typeof seedRpgGameRows>>;
  readonly assistant: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>["messages"][number];
  readonly snapshot: typeof rpgSnapshots.$inferSelect;
}

function physicalScene(quietSecond = false): ReturnType<typeof createCorpusProviderExecution> {
  let calls = 0;
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller preserves the observatory ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => {
      calls += 1;
      if (calls > 2) {
        throw new Error("the checkpoint physical script has no additional model reply");
      }
      return {
        text: "The traveller studies the observatory.",
        toolCalls:
          quietSecond && calls === 2
            ? [{ name: RPG_NO_CHANGES_TOOL, argumentsJson: "{}" }]
            : [
                {
                  name: RPG_LITE_TOOL_NAMES[2],
                  argumentsJson: JSON.stringify({
                    location: "Model observatory",
                    weather: { type: calls === 1 ? "clear" : "rain" },
                    recentEvent: calls === 1 ? "The traveller entered." : "Rain reached the dome.",
                  }),
                },
              ],
      };
    },
  });
}

async function foldedScene(root: ServerTestHarness): Promise<FoldedScene> {
  const actors = await seedCorpusActors(root);
  await root.services.connection.update({
    principal: actors.owner,
    connectionId: actors.connections.text.id,
    patch: {
      declared: declaredCapabilitySchema.parse({
        ...actors.connections.text.declared,
        generation: { ...actors.connections.text.declared?.generation, tools: { parallel: true, silencesProse: false } },
      }),
    },
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = await seedRecallRoom(caller);
  const game = await seedRpgGameRows(root, { principal: actors.owner, chatId, mode: "lite" });
  const turn = await root.services.chat.send({ principal: actors.owner, chatId, content: "Enter the observatory.", intent: INTENT });
  expect(turn.aborted).toBe(false);
  const assistant = turn.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the actual folded turn produced no assistant variant");
  }
  await root.settleBackground();
  const [snapshot] = await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, assistant.selectedVariantId));
  if (snapshot === undefined) {
    throw new Error("the actual folded turn produced no snapshot");
  }
  expect(snapshot).toMatchObject({ gameId: game.id, messageId: assistant.id, variantId: assistant.selectedVariantId, committed: 0 });
  return { ...actors, caller, chatId, game, assistant, snapshot };
}

async function capturedRows(
  root: ServerTestHarness,
  gameId: RpgGameId,
  chatId: ChatId,
): Promise<{
  readonly snapshots: readonly (typeof rpgSnapshots.$inferSelect)[];
  readonly checkpoints: readonly (typeof rpgCheckpoints.$inferSelect)[];
  readonly canon: readonly (typeof messages.$inferSelect)[];
}> {
  return {
    snapshots: await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId)).orderBy(rpgSnapshots.id),
    checkpoints: await root.db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.gameId, gameId)).orderBy(rpgCheckpoints.id),
    canon: await root.db.select().from(messages).where(eq(messages.chatId, chatId)).orderBy(messages.seq),
  };
}

test("a checkpoint freezes a real folded draft across host edits and continuation and restores its exact hand state", async () => {
  const wire = physicalScene();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  const targetRef = { kind: "user", userId: scene.owner.userId } as const;
  expect(await root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "Saved observatory key" } }] })).toEqual({ ok: true });
  expect(await root.services.rpg.editSnapshot({ ...params, patch: { location: SAVED_LOCATION } })).toEqual({ ok: true });
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Observatory bookmark" });
  const bookmarked = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  expect(await root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "Later observatory key" } }] })).toEqual({ ok: true });
  expect(await root.services.rpg.editSnapshot({ ...params, patch: { location: EDITED_LOCATION } })).toEqual({ ok: true });
  expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toEqual(bookmarked);
  expect(bookmarked).toMatchObject({ gameId: scene.game.id, messageId: null, variantId: null, asOfMessageId: scene.assistant.id, committed: 1 });
  expect(bookmarked.id).not.toBe(scene.snapshot.id);

  const continued = await root.services.chat.continueTurn({ ...params, messageId: scene.assistant.id, intent: INTENT });
  expect(continued.aborted).toBe(false);
  await root.settleBackground();
  const original = await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, scene.assistant.selectedVariantId));
  expect(original).toMatchObject([
    { id: scene.snapshot.id, gameId: scene.game.id, messageId: scene.assistant.id, variantId: scene.assistant.selectedVariantId },
  ]);
  expect(original).toHaveLength(1);
  expect((await root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: EDITED_LOCATION, weather: { type: "rain" } });
  expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toEqual(bookmarked);
  await root.services.rpg.restoreCheckpoint({ ...params, checkpointId: checkpoint.id });
  const restoredCheckpoint = await seedRpgCheckpointRows(root, { ...params, label: "Restored observatory" });
  const restored = await captureRpgSnapshot(root.db, restoredCheckpoint.snapshotId);
  const canon = await root.services.chat.listMessages(params);
  expect(restored).toEqual({ ...bookmarked, id: restored.id, asOfMessageId: canon.messages.at(-1)?.id, createdAt: root.clock.now() });
  expect(restored.id).not.toBe(bookmarked.id);
  expect((await root.services.rpg.getTrackerView(params)).ambient).toMatchObject({ location: SAVED_LOCATION, weather: { type: "clear" } });
  expect(wire.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(2);
});

test("an already immutable hand bookmark reuses its real target without adding another snapshot or canon row", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const params = { principal, chatId: chat.id };
  const game = await seedRpgGameRows(root, { ...params, mode: "lite" });
  expect(await root.services.rpg.editSnapshot({ ...params, patch: { location: SAVED_LOCATION } })).toEqual({ ok: true });
  const before = await capturedRows(root, game.id, chat.id);
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Existing hand state" });
  expect(checkpoint.snapshotId).toBe(before.snapshots[0]?.id);
  expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toMatchObject({ variantId: null, messageId: null, committed: 1, location: SAVED_LOCATION });
  const after = await capturedRows(root, game.id, chat.id);
  expect(after.snapshots).toEqual(before.snapshots);
  expect(after.canon).toEqual(before.canon);
});

test("a real user-committed turn still detaches its bookmark and preserves the source variant and actual later tail", async () => {
  const wire = physicalScene(true);
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  const next = await root.services.chat.send({ ...params, content: "Preserve the observed turn without changing state.", intent: INTENT });
  expect(next.aborted).toBe(false);
  const tail = next.messages.find((message) => message.role === "assistant");
  if (tail === undefined) {
    throw new Error("the quiet committing turn produced no real assistant tail");
  }
  await root.settleBackground();
  const source = await captureRpgSnapshot(root.db, scene.snapshot.id);
  expect(source.committed).toBe(1);
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Committed turn" });
  const bookmark = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  expect(bookmark).toEqual({ ...source, id: bookmark.id, messageId: null, variantId: null, asOfMessageId: tail.id, committed: 1, createdAt: root.clock.now() });
  expect(bookmark.id).not.toBe(source.id);
  expect(await captureRpgSnapshot(root.db, source.id)).toEqual(source);
  expect(await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, scene.assistant.selectedVariantId))).toEqual([source]);
});

for (const table of [rpgSnapshots, rpgCheckpoints]) {
  test(`failed native ${getTableName(table)} insertion leaves neither detached bookmark nor checkpoint and releases the owner`, async () => {
    const wire = physicalScene();
    await using root = await createServerHarness({ providerFetch: wire.execute });
    const scene = await foldedScene(root);
    const params = { principal: scene.owner, chatId: scene.chatId };
    const before = await capturedRows(root, scene.game.id, scene.chatId);
    await using refusal = await refuseWrites(root.db, { table, event: "INSERT", message: "checkpoint write refused" });
    try {
      await expect(root.services.rpg.createCheckpoint({ ...params, label: "Refused native write" })).rejects.toThrow("checkpoint write refused");
      expect(await capturedRows(root, scene.game.id, scene.chatId)).toEqual(before);
    } finally {
      await refusal.lift();
    }
    const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Allowed retry" });
    expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toMatchObject({ gameId: scene.game.id, committed: 1, variantId: null });
    expect(await captureRpgSnapshot(root.db, scene.snapshot.id)).toEqual(scene.snapshot);
  });
}

test("checkpoint writes and restores retain actual host and game authority without a foreign mutation", async () => {
  const wire = physicalScene();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Host bookmark" });
  const member = await root.principalFor(scene.secondUserId);
  const invitation = await root.services.chat.createInvite({ ...params, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const stranger = await root.principalFor((await root.actor({ role: "admin" })).id);
  const before = await capturedRows(root, scene.game.id, scene.chatId);
  await expect(root.services.rpg.createCheckpoint({ ...params, principal: member, label: "Member bookmark" })).rejects.toBeInstanceOf(DomainForbiddenError);
  await expect(root.services.rpg.restoreCheckpoint({ ...params, principal: member, checkpointId: checkpoint.id })).rejects.toBeInstanceOf(DomainForbiddenError);
  await expect(root.services.rpg.createCheckpoint({ ...params, principal: stranger, label: "Foreign bookmark" })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.rpg.restoreCheckpoint({ ...params, principal: stranger, checkpointId: checkpoint.id })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  const other = await scene.caller.chat.startChat({ characterIds: [], opening: "none" });
  await scene.caller.rpg.createGame({ chatId: other.chat.id, mode: "lite" });
  expect(await scene.caller.rpg.editSnapshot({ chatId: other.chat.id, patch: { location: "Other game" } })).toEqual({ ok: true });
  const foreign = await seedRpgCheckpointRows(root, { ...params, chatId: other.chat.id, label: "Other game bookmark" });
  await expect(root.services.rpg.restoreCheckpoint({ ...params, checkpointId: foreign.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await capturedRows(root, scene.game.id, scene.chatId)).toEqual(before);
});

test("a held checkpoint commit serializes a competing hand edit through its new immutable head", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const wire = physicalScene();
  const root = ownership.use(await createServerHarness({ db: held.db, providerFetch: wire.execute }));
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  expect(await root.services.rpg.editSnapshot({ ...params, patch: { location: SAVED_LOCATION } })).toEqual({ ok: true });
  const pending: Promise<void>[] = [];
  const gate = held.hold(/^insert into "rpg_checkpoints"/u);
  try {
    const checkpointWrite = root.services.rpg.createCheckpoint({ ...params, label: "Held bookmark" });
    pending.push(checkpointWrite.then(() => undefined));
    await gate.reached;
    gate.disarm();
    const edit = root.services.rpg.editSnapshot({ ...params, patch: { location: EDITED_LOCATION } });
    pending.push(edit.then(() => undefined));
    expect((await root.services.rpg.getTrackerView(params)).ambient?.location).toBe(SAVED_LOCATION);
    expect(await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, scene.game.id))).toHaveLength(1);
    gate.release();
    const checkpointId = await checkpointWrite;
    expect(await edit).toEqual({ ok: true });
    const [checkpoint] = await root.services.rpg.listCheckpoints(params);
    expect(checkpoint?.id).toBe(checkpointId);
    if (checkpoint === undefined) {
      throw new Error("the actual held checkpoint did not commit");
    }
    expect((await root.services.rpg.getTrackerView(params)).ambient?.location).toBe(EDITED_LOCATION);
    expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toMatchObject({ location: SAVED_LOCATION, committed: 1, variantId: null });
  } finally {
    gate.release();
    await Promise.all(pending);
  }
});

test("a real continuation overlaps the held bookmark without replacing its saved state or source variant identity", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const wire = physicalScene();
  const root = ownership.use(await createServerHarness({ db: held.db, providerFetch: wire.execute }));
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  const pending: Promise<void>[] = [];
  const checkpointGate = held.hold(/^insert into "rpg_checkpoints"/u);
  try {
    const checkpointWrite = root.services.rpg.createCheckpoint({ ...params, label: "Continuation bookmark" });
    pending.push(checkpointWrite.then(() => undefined));
    await checkpointGate.reached;
    checkpointGate.disarm();
    const turnGate = held.hold(/^insert into "rpg_snapshots"/u);
    try {
      const continuation = root.services.chat.continueTurn({ ...params, messageId: scene.assistant.id, intent: INTENT });
      pending.push(continuation.then(() => undefined));
      expect((await continuation).aborted).toBe(false);
      await turnGate.reached;
    } finally {
      turnGate.release();
    }
    checkpointGate.release();
    const checkpointId = await checkpointWrite;
    await root.settleBackground();
    const [checkpoint] = await root.services.rpg.listCheckpoints(params);
    expect(checkpoint?.id).toBe(checkpointId);
    if (checkpoint === undefined) {
      throw new Error("the actual overlapping checkpoint did not commit");
    }
    const bookmark = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
    expect(bookmark.weather).toEqual(scene.snapshot.weather);
    expect(bookmark).toMatchObject({ committed: 1, variantId: null, messageId: null, asOfMessageId: scene.assistant.id });
    const originals = await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, scene.assistant.selectedVariantId));
    expect(originals).toHaveLength(1);
    expect(originals[0]).toMatchObject({
      id: scene.snapshot.id,
      messageId: scene.assistant.id,
      variantId: scene.assistant.selectedVariantId,
      weather: { type: "rain" },
    });
    expect((await root.services.rpg.getTrackerView(params)).ambient?.weather).toMatchObject({ type: "rain" });
    expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toEqual(bookmark);
    await root.services.rpg.restoreCheckpoint({ ...params, checkpointId });
    expect((await root.services.rpg.getTrackerView(params)).ambient?.weather).toEqual(scene.snapshot.weather);
  } finally {
    checkpointGate.release();
    await Promise.all(pending);
  }
});

test("a held restore orders a competing hand gesture after its faithful narrator and snapshot batch", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const wire = physicalScene();
  const root = ownership.use(await createServerHarness({ db: held.db, providerFetch: wire.execute }));
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  const targetRef = { kind: "user", userId: scene.owner.userId } as const;
  expect(await root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "Saved key" } }] })).toEqual({ ok: true });
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Restore ordering" });
  const saved = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  expect(await root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "Discarded later key" } }] })).toEqual({ ok: true });
  const pending: Promise<void>[] = [];
  const gate = held.hold(/^insert into "messages"/u);
  try {
    const restore = root.services.rpg.restoreCheckpoint({ ...params, checkpointId: checkpoint.id });
    pending.push(restore);
    await gate.reached;
    gate.disarm();
    const edit = root.services.rpg.patchActor({ ...params, targetRef, ops: [{ op: "addItem", item: { name: "After restore key" } }] });
    pending.push(edit.then(() => undefined));
    expect((await root.services.rpg.getTrackerView(params)).actors.find((actor) => actor.actorRef.kind === "user")?.volatile?.inventory).toHaveLength(2);
    gate.release();
    await restore;
    expect(await edit).toEqual({ ok: true });
    const tracker = await root.services.rpg.getTrackerView(params);
    expect(tracker.actors.find((actor) => actor.actorRef.kind === "user")?.volatile?.inventory.map((item) => item.name)).toEqual([
      "Saved key",
      "After restore key",
    ]);
    expect(await captureRpgSnapshot(root.db, checkpoint.snapshotId)).toEqual(saved);
  } finally {
    gate.release();
    await Promise.all(pending);
  }
});

test("a native restore snapshot failure keeps both the narrator and saved state absent before a successful retry", async () => {
  const wire = physicalScene();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const scene = await foldedScene(root);
  const params = { principal: scene.owner, chatId: scene.chatId };
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Restore failure" });
  expect(await root.services.rpg.editSnapshot({ ...params, patch: { location: EDITED_LOCATION } })).toEqual({ ok: true });
  const before = await capturedRows(root, scene.game.id, scene.chatId);
  await using refusal = await refuseWrites(root.db, { table: rpgSnapshots, event: "INSERT", message: "restore snapshot refused" });
  try {
    await expect(root.services.rpg.restoreCheckpoint({ ...params, checkpointId: checkpoint.id })).rejects.toThrow("restore snapshot refused");
    expect(await capturedRows(root, scene.game.id, scene.chatId)).toEqual(before);
  } finally {
    await refusal.lift();
  }
  await root.services.rpg.restoreCheckpoint({ ...params, checkpointId: checkpoint.id });
  expect((await root.services.rpg.getTrackerView(params)).ambient?.location).toBe(scene.snapshot.location);
  const after = await capturedRows(root, scene.game.id, scene.chatId);
  expect(after.snapshots).toHaveLength(before.snapshots.length + 1);
  expect(after.canon).toHaveLength(before.canon.length + 1);
});
