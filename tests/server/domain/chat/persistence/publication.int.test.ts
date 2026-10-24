// The real chat bus establishes durability; only its stamped result can reach the live publisher.
// @subject packages/server/src/domain/chat/persistence/events.ts
// The emitter's claim is a raw unexecuted statement by contract, so the durable append suite builds one here.

import type { ChatLivePublish } from "@orb/contracts/chat";
import { chatEvents, chats } from "@orb/db";
import { batchStmt } from "@orb/db/query";
import { databaseHandle } from "@orb/db/wiring-driver";
import { statementToken } from "@orb/db/wiring-owner";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createChatBus, createChatPublication } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createTestLogger } from "@orb/testkit/node/composed";
import { seedChatRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";
import { vi } from "vitest";

async function hostedRoom(
  harness: ServerTestHarness,
): Promise<{ readonly room: Awaited<ReturnType<typeof seedChatRows>>["row"]; readonly host: Awaited<ReturnType<ServerTestHarness["principalFor"]>> }> {
  const host = await harness.principalFor((await harness.actor()).id);
  return { room: (await seedChatRows(harness, { principal: host, characterIds: [] })).row, host };
}

test("durable append precedes fan, a lost claim converges without fan, and a deleted room never fans an unlogged event", async ({
  harness,
  db,
  clock,
}): Promise<void> => {
  const { room, host } = await hostedRoom(harness);
  const published: ChatLivePublish[] = [];
  const bus = createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => mintTypeId(ID_PREFIX.chatEvent) });
  const publication = createChatPublication({
    bus,
    publish: (event): void => {
      expect(bus.readRing(room.id).at(-1)).toEqual(event);
      published.push(event);
    },
    silenceRoomEntityFan: () => false,
  });
  expect(await publication.emitChecked({ type: "chatUpdated", chatId: room.id })).toBe(true);
  expect((await db.select().from(chatEvents).where(eq(chatEvents.chatId, room.id)).orderBy(chatEvents.seq)).at(-1)?.payload).toEqual(published[0]?.event);
  const missing = mintTypeId(ID_PREFIX.chat);
  expect(
    await publication.emitChecked(
      { type: "chatUpdated", chatId: room.id },
      statementToken(batchStmt(db.update(chats).set({ title: "claim" }).where(eq(chats.id, missing)))),
    ),
  ).toBe(true);
  expect(published).toHaveLength(1);
  await harness.services.chat.delete({ principal: host, chatId: room.id });
  expect(await publication.emitChecked({ type: "chatUpdated", chatId: room.id })).toBe(false);
  expect(published).toHaveLength(1);
});

test("quiet entity churn may coalesce but a terminal delete remains live and append-free", async ({ harness, db, clock }): Promise<void> => {
  const { room } = await hostedRoom(harness);
  const before = await db.select().from(chatEvents);
  const publish = vi.fn();
  const quiet = vi.fn(() => true);
  const publication = createChatPublication({
    bus: createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => mintTypeId(ID_PREFIX.chatEvent) }),
    publish,
    silenceRoomEntityFan: quiet,
  });
  publication.emitLive({ type: "roomEntityChanged", chatId: room.id, entity: "character" });
  expect(quiet).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
  publication.emitLive({ type: "chatDeleted", chatId: room.id });
  expect(quiet).toHaveBeenCalledTimes(1);
  expect(publish).toHaveBeenCalledWith({ seq: null, event: { type: "chatDeleted", chatId: room.id } });
  expect(await db.select().from(chatEvents)).toEqual(before);
});
