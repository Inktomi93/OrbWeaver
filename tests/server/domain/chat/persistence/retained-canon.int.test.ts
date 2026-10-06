import type { StatsDelta } from "@orb/contracts/stats";
import { characters, chatParticipants, chats, ownerStats, statsCanonVersions } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { ChatParticipantId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { statsBucketStart } from "@orb/kit/stats-tally";
import { eq } from "drizzle-orm";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { commitRetainedCanonStats } from "../../../../../packages/server/src/domain/chat/persistence/retained-canon.ts";
import { applyStatsDelta, bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/index.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext } from "../_support.ts";

test.for([false, true])("retained canon and both owner deltas commit atomically; changed cohort: %s", async (change, { db, ids, clock }) => {
  const a = await seedUser(db);
  const b = await seedUser(db);
  const outsider = await seedUser(db);
  const room = await seedChat(db);
  const voice = await seedCharacter(db, { ownerId: a.id });
  const other = await seedCharacter(db, { ownerId: b.id });
  for (const card of [voice, other]) {
    await db.insert(chatParticipants).values({
      id: castId<ChatParticipantId>(ids.next(ID_PREFIX.chatParticipant)),
      chatId: room.id,
      kind: "character",
      characterId: card.id,
      role: "member",
      joinSeq: 0,
    });
  }
  const base = makeChatContext(db, {
    now: clock.now,
    applyStatsDelta: (statements, opDb, appliedDelta) => applyStatsDelta(statements as BatchStmt[], opDb, appliedDelta),
    bumpStatsCanonVersion: (statements, opDb, owner) => bumpStatsCanonVersion(statements as BatchStmt[], opDb, owner),
  });
  const ctx = {
    ...base,
    resolveRetainedChatAccountingScope: async (...args: Parameters<typeof base.resolveRetainedChatAccountingScope>) => {
      const snapshot = await base.resolveRetainedChatAccountingScope(...args);
      if (change) {
        await db.update(characters).set({ ownerId: outsider.id }).where(eq(characters.id, other.id));
      }
      return snapshot;
    },
  };
  const delta: StatsDelta = {
    ownerId: a.id,
    characterId: voice.id,
    model: null,
    provider: null,
    now: clock.now(),
    bucketStart: statsBucketStart(clock.now()),
    costUsd: 0.25,
    costSamples: 1,
  };
  const operation = commitRetainedCanonStats(ctx, room.id, [batchStmt(db.update(chats).set({ title: "Committed" }).where(eq(chats.id, room.id)))], [delta]);
  const refusalCode = await operation.then(
    () => null,
    (error: unknown) => {
      if (error instanceof ChatOperationError) {
        return error.code;
      }
      throw error;
    },
  );
  expect(refusalCode).toBe(change ? CHAT_OP_CODES.aborted : null);
  expect((await db.select().from(chats))[0]?.title).toBe(change ? null : "Committed");
  const expectedStats = change
    ? []
    : [
        [a.id, 0.25, 1],
        [b.id, 0.25, 1],
      ].sort();
  expect((await db.select().from(ownerStats)).map((row) => [row.ownerId, row.costUsd, row.costSamples]).sort()).toEqual(expectedStats);
  if (!change) {
    await commitRetainedCanonStats(base, room.id, [batchStmt(db.update(chats).set({ title: "Metadata edit" }).where(eq(chats.id, room.id)))], []);
  }
  const expectedFences = change
    ? []
    : [
        [a.id, 2],
        [b.id, 2],
      ].sort();
  expect((await db.select().from(statsCanonVersions)).map((row) => [row.ownerId, row.version]).sort()).toEqual(expectedFences);
});
