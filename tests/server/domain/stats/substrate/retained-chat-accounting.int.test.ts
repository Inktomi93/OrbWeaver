import { chatParticipants } from "@orb/db";
import type { CharacterId, ChatParticipantId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { retainedRebaseProjection } from "../../../../../packages/server/src/domain/stats/substrate/retained-chat-accounting.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("accepted rekeys retain departed seats and deduplicate owners; mismatched plans do not silently rebase", async ({ db, ids }) => {
  const a = await seedUser(db);
  const b = await seedUser(db);
  const room = await seedChat(db);
  const source = await seedCharacter(db, { ownerId: a.id });
  const target = await seedCharacter(db, { ownerId: b.id });
  const seat = castId<ChatParticipantId>(ids.next(ID_PREFIX.chatParticipant));
  await db.insert(chatParticipants).values({ id: seat, chatId: room.id, kind: "character", characterId: source.id, role: "member", joinSeq: 0, leftSeq: 2 });
  const input = {
    rekeys: { chatId: room.id, seats: new Map([[seat, target.id]]), characters: new Map([[source.id, target.id]]) },
    ownerIds: [a.id],
    seats: await db.select().from(chatParticipants),
    slots: [],
    variants: [],
    cardOwners: [
      { id: source.id, ownerId: a.id },
      { id: target.id, ownerId: b.id },
    ],
  };
  expect(retainedRebaseProjection(input)).toMatchObject({
    beforeOwnerIds: [a.id],
    afterOwnerIds: [b.id],
    beforeSeatIds: [source.id],
    afterSeatIds: [target.id],
    planStillMatches: true,
  });
  expect(retainedRebaseProjection({ ...input, rekeys: { ...input.rekeys, characters: new Map<CharacterId, CharacterId>() } }).planStillMatches).toBe(false);
  expect(retainedRebaseProjection({ ...input, cardOwners: [{ id: source.id, ownerId: a.id }] }).afterOwnerIds).toEqual([]);
});
