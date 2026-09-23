// tests/server/domain/rpg/chat-ops/index — the `ChatRpgOps` runtime (docs/plans/rpg/design.md). The thin ctx ops:
// the mode-blind preset knob read, the send-path snapshot commit, the abort clear, and the always-null seat
// read. The gather + flush have their own mirrors (`./gather`, `./flush`).

import { batchMany } from "@orb/db/kit";
import type { ChatTurnId, Handle, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { findSnapshotByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../../support/db.ts";
import { emptyState, expect, makeRpgService, principal, seedChat, seedLiteGame, seedMessage, seedPreset, test, turnConnection } from "../_support.ts";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_c1");

test("planGameBirth contributes an unexecuted RPG row and emits only after the caller commits it", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "birth");
  const h = makeRpgService(db);

  const plan = h.chatOps.planGameBirth(chatId, {});
  expect(await findGameByChat(db, chatId)).toBeUndefined();
  expect(h.fakes.busEvents).toEqual([]);

  await db.batch(batchMany([...plan.statements]));
  h.chatOps.gameBirthCommitted(chatId);

  expect((await findGameByChat(db, chatId))?.id).toBe(plan.gameId);
  expect(h.fakes.busEvents).toEqual([{ type: "gameChanged", chatId }]);
});

test("resolvePresetOverride is MODE-BLIND: born NULL (augment) until the knob is set", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  expect(await h.chatOps.resolvePresetOverride(chatId)).toBeNull();

  const presetId = await seedPreset(db, "gm", "host");
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, gmPresetId: presetId });
  expect(await h.chatOps.resolvePresetOverride(chatId)).toBe(presetId);
});

test("resolvePresetOverride is null for a NON-game chat (byte-identical)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "plain");
  const { h } = await seedLiteGame(db);
  expect(await h.chatOps.resolvePresetOverride(chatId)).toBeNull();
});

test("onUserCommit locks in the assistant snapshot the user was replying to (committed 0 → 1)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  // An assistant slot with a staged (committed=0) snapshot from its turn.
  const { messageId: aMsg, variantId: aVar } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.ctx.staging.ensure(TURN, emptyState());
  h.ctx.staging.stage(TURN, { location: "the ford" });
  await h.chatOps.onTurnCompleted(chatId, aMsg, aVar, TURN, turnConnection());
  expect((await findSnapshotByVariant(db, aVar))?.committed).toBe(0);

  // The user sends the NEXT message → onUserCommit locks in the prior assistant snapshot.
  const { messageId: uMsg } = await seedMessage(db, chatId, 2, { role: "user" });
  await h.chatOps.onUserCommit(chatId, uMsg);
  expect((await findSnapshotByVariant(db, aVar))?.committed).toBe(1);
});

test("onUserCommit is a no-op for a non-game chat / a vanished message", async () => {
  const db = await freshDb();
  const plain = await seedChat(db, "plain");
  const { chatId, h } = await seedLiteGame(db);
  // Non-game chat — no throw, no write.
  await h.chatOps.onUserCommit(plain, castId<MessageId>("message_nope"));
  // A game chat, but the message id doesn't exist — the seq lookup misses, no-op.
  await h.chatOps.onUserCommit(chatId, castId<MessageId>("message_ghost"));
  expect(true).toBe(true); // reaching here without a throw is the assertion
});

test("onTurnAborted CLEARS the turn bucket — a dead turn never flushes into the next", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  // Stage a write, then ABORT — the bucket is dropped.
  h.ctx.staging.ensure(TURN, emptyState());
  h.ctx.staging.stage(TURN, { location: "ghost location" });
  await h.chatOps.onTurnAborted(chatId, TURN, "user");
  // A completion on the same turn now finds nothing staged → no snapshot written.
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
});

test("resolveGmSeatHolderKind is always null in lite (no GM seat)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  expect(await h.chatOps.resolveGmSeatHolderKind(chatId)).toBeNull();
});
