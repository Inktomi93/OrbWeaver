// verbs/checkpoint/restore-checkpoint — restoreCheckpoint (docs/plans/rpg/design.md). Clones the checkpointed
// snapshot FORWARD, born committed, onto a fresh narrator slot. Asserted at the restored snapshot.
// @subject packages/server/src/domain/rpg/verbs/checkpoint/restore-checkpoint.ts

import type { Db } from "@orb/db";
import { messages, rpgCheckpoints, rpgSnapshots } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { ChatId, Handle, MessageId, MessageVariantId, RpgCheckpointId, RpgSnapshotId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PostNarratorMessage } from "@orb/server/domain/chat";
import { createPostNarratorMessage } from "@orb/server/domain/chat";
import { createRpgRestorePost } from "@orb/server/entry/compose";
import { freshDb } from "@orb/testkit/node/db.ts";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { createRpgService } from "#server/domain/rpg/index.ts";
import { resolveSnapshotForTurn } from "#server/domain/rpg/persistence/snapshots.ts";
import { makeChatContext, noClaim, seedCharacter, seedParticipant, seedUser } from "../../../chat/_support.ts";
import type { RpgHarness } from "../../_support.ts";
import { expect, principal, seedLiteGame, seedMessage, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("restoreCheckpoint", () => {
  test("clones the checkpointed snapshot forward onto a NEW narrator slot, born committed", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db);
    await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "The Ruins" } });
    const checkpointId = await h.service.createCheckpoint({ principal: principal(castId<Handle>("host")), chatId, label: "before the fight" });

    // Move on: change the location.
    await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "The Aftermath" } });
    expect((await resolveSnapshotForTurn(db, { id: gameId, chatId }))?.location).toBe("The Aftermath");

    // Restore: the checkpointed "The Ruins" clones forward onto a NEW narrator slot, born committed.
    const postsBefore = h.fakes.narratorPosts.length;
    await h.service.restoreCheckpoint({ principal: principal(castId<Handle>("host")), chatId, checkpointId });
    expect(h.fakes.narratorPosts.length).toBe(postsBefore + 1); // a fresh narrator slot was minted
    const restored = await resolveSnapshotForTurn(db, { id: gameId, chatId });
    expect(restored?.location).toBe("The Ruins");
    expect(restored?.committed).toBe(1);
  });

  test("an injected marker failure leaves neither marker nor restored snapshot visible; retry lands one pair", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db, {}, "marker-failure");
    const checkpointId = await seedCheckpointedState(chatId, h);
    const duplicate = await seedMessage(db, chatId, 1, { role: "assistant", content: "existing row" });
    const beforeMessages = await db.select().from(messages).where(eq(messages.chatId, chatId));
    const beforeSnapshots = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
    const beforeBusEvents = h.fakes.busEvents.length;
    const retryMessageId = castId<MessageId>("message_restore_marker_retry");
    const post = await realNarratorPost(chatId, {
      messageId: sequence(duplicate.messageId, retryMessageId),
      variantId: sequence(castId<MessageVariantId>("variant_restore_marker_failure"), castId<MessageVariantId>("variant_restore_marker_retry")),
    });
    const service = createRpgService({ ...h.ctx, postNarratorMessage: createRpgRestorePost(post) });

    await expect(service.restoreCheckpoint({ principal: principal(castId<Handle>("host")), chatId, checkpointId })).rejects.toThrow();
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(beforeMessages.length);
    expect(await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId))).toHaveLength(beforeSnapshots.length);
    expect(h.fakes.busEvents).toHaveLength(beforeBusEvents);

    await service.restoreCheckpoint({ principal: principal(castId<Handle>("host")), chatId, checkpointId });
    const afterMessages = await db.select().from(messages).where(eq(messages.chatId, chatId));
    const afterSnapshots = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
    expect(afterMessages).toHaveLength(beforeMessages.length + 1);
    expect(afterMessages.filter((row) => row.kind === "narrator")).toHaveLength(1);
    expect(afterSnapshots).toHaveLength(beforeSnapshots.length + 1);
    const [restored] = afterSnapshots.filter((row) => row.asOfMessageId === retryMessageId);
    expect(restored).toMatchObject({ location: "The Ruins", committed: 1, messageId: null, variantId: null });
    expect(h.fakes.busEvents).toHaveLength(beforeBusEvents + 1);
  });

  test("an injected snapshot failure rolls the marker back; retry lands exactly one restored pair", async () => {
    const { chatId, gameId, h } = await seedLiteGame(db, {}, "snapshot-failure");
    const checkpointId = await seedCheckpointedState(chatId, h);
    const [checkpoint] = await db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.id, checkpointId));
    if (checkpoint === undefined) {
      throw new Error("checkpoint fixture missing");
    }
    const beforeMessages = await db.select().from(messages).where(eq(messages.chatId, chatId));
    const beforeSnapshots = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
    const beforeBusEvents = h.fakes.busEvents.length;
    const retrySnapshotId = castId<RpgSnapshotId>("rpg_snapshot_restore_retry");
    const post = await realNarratorPost(chatId);
    const service = createRpgService({
      ...h.ctx,
      ids: { ...h.ctx.ids, snapshot: sequence(checkpoint.snapshotId, retrySnapshotId) },
      postNarratorMessage: createRpgRestorePost(post),
    });

    await expect(service.restoreCheckpoint({ principal: principal(castId<Handle>("host")), chatId, checkpointId })).rejects.toThrow();
    expect(await db.select().from(messages).where(eq(messages.chatId, chatId))).toHaveLength(beforeMessages.length);
    expect(await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId))).toHaveLength(beforeSnapshots.length);
    expect(h.fakes.busEvents).toHaveLength(beforeBusEvents);

    await service.restoreCheckpoint({ principal: principal(castId<Handle>("host")), chatId, checkpointId });
    const afterMessages = await db.select().from(messages).where(eq(messages.chatId, chatId));
    const afterSnapshots = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
    expect(afterMessages).toHaveLength(beforeMessages.length + 1);
    expect(afterMessages.filter((row) => row.kind === "narrator")).toHaveLength(1);
    expect(afterSnapshots).toHaveLength(beforeSnapshots.length + 1);
    const [restored] = afterSnapshots.filter((row) => row.id === retrySnapshotId);
    expect(restored).toMatchObject({ location: "The Ruins", committed: 1, messageId: null, variantId: null });
    expect(h.fakes.busEvents).toHaveLength(beforeBusEvents + 1);
  });
});

async function seedCheckpointedState(chatId: ChatId, h: RpgHarness): Promise<RpgCheckpointId> {
  await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "The Ruins" } });
  return h.service.createCheckpoint({ principal: principal(castId<Handle>("host")), chatId, label: "before the fight" });
}

async function realNarratorPost(
  chatId: ChatId,
  ids: { readonly messageId?: () => MessageId; readonly variantId?: () => MessageVariantId } = {},
): Promise<PostNarratorMessage> {
  const host = await seedUser(db, castId<Handle>("host"));
  await seedParticipant(db, { chatId, key: `host-${chatId}`, userId: host, role: "host" });
  const group = await seedCharacter(db, host, `narrator-${chatId}`);
  const ctx = makeChatContext(db, {
    mintSyntheticGroupCharacter: () => Promise.resolve({ characterId: group }),
    ...(ids.messageId === undefined ? {} : { newMessageId: ids.messageId }),
    ...(ids.variantId === undefined ? {} : { newMessageVariantId: ids.variantId }),
  });
  return createPostNarratorMessage({ ...ctx, db: databaseHandle(ctx.db) }, { emit: () => Promise.resolve(), claimChat: noClaim });
}

function sequence<T>(first: T, second: T): () => T {
  const values = [first, second];
  let index = 0;
  return (): T => values[Math.min(index++, values.length - 1)] as T;
}
