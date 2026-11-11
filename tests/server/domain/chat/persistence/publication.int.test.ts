// The real chat bus establishes durability; only its stamped result can reach the live publisher.
// @subject packages/server/src/domain/chat/persistence/events.ts
// The emitter's claim is a raw unexecuted statement by contract, so the durable append suite builds one here.

import type { ChatLivePublish } from "@orb/contracts/chat";
import type { ProviderId } from "@orb/contracts/inference";
import { chatEvents, chats } from "@orb/db";
import { batchStmt } from "@orb/db/query";
import { databaseHandle } from "@orb/db/wiring-driver";
import { statementToken } from "@orb/db/wiring-owner";
import type { ChatTurnId } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { createChatBus, createChatPublication } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createTestLogger, refuseWrites } from "@orb/testkit/node/composed";
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
  ids,
}): Promise<void> => {
  const { room, host } = await hostedRoom(harness);
  const published: ChatLivePublish[] = [];
  const bus = createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => ids.typeId(ID_PREFIX.chatEvent) });
  const publication = createChatPublication({
    bus,
    publish: (event): void => {
      published.push(event);
    },
    silenceRoomEntityFan: () => false,
  });
  expect(await publication.emitChecked({ type: "chatUpdated", chatId: room.id })).toBe(true);
  // The fanned seq is the durable row's: only a committed append can have produced it.
  const logged = (await db.select().from(chatEvents).where(eq(chatEvents.chatId, room.id)).orderBy(chatEvents.seq)).at(-1);
  expect(published).toEqual([{ seq: logged?.seq, event: logged?.payload }]);
  const missing = ids.typeId(ID_PREFIX.chat);
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

test("a delta from a turn the bus never saw start, or a continue with no body to resume, stamps no member bytes", async ({
  harness,
  db,
  clock,
  ids,
}): Promise<void> => {
  const { room } = await hostedRoom(harness);
  const bus = createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => ids.typeId(ID_PREFIX.chatEvent) });
  const chatId = room.id;
  const streamed = async (turnId: ChatTurnId): Promise<unknown> => {
    const delta = { chatId, kind: "text", text: 'held-past-the-join"/> A tail.' } as const;
    return (await bus.emit({ type: "delta", chatId, turnId, slotSeq: 1, delta }))?.event;
  };
  expect(await streamed(ids.typeId(ID_PREFIX.chatTurn))).toMatchObject({ memberText: "" });
  const continued = ids.typeId(ID_PREFIX.chatTurn);
  const started = {
    type: "turnStarted",
    chatId,
    turnId: continued,
    api: null,
    provider: castId<ProviderId>("custom-openai"),
    model: "a-model",
    speakerCharacterId: null,
  } as const;
  await bus.emit({ ...started, intent: "continue", targetMessageId: ids.typeId(ID_PREFIX.message) });
  expect(await streamed(continued)).toMatchObject({ memberText: "" });
});

test("quiet entity churn may coalesce but a terminal delete remains live and append-free", async ({ harness, db, clock, ids }): Promise<void> => {
  const { room } = await hostedRoom(harness);
  const before = await db.select().from(chatEvents);
  const publish = vi.fn();
  const quiet = vi.fn(() => true);
  const publication = createChatPublication({
    bus: createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => ids.typeId(ID_PREFIX.chatEvent) }),
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

test("a room deleted mid-turn leaves the bus holding no open turn for it", async ({ harness, db, clock, ids }): Promise<void> => {
  const { room } = await hostedRoom(harness);
  const bus = createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => ids.typeId(ID_PREFIX.chatEvent) });
  const turnId = ids.typeId(ID_PREFIX.chatTurn);
  await bus.emit({ type: "turnAccepted", chatId: room.id, turnId, intent: "send", speakerCharacterId: null, targetMessageId: null });
  expect([...bus.openTurns(room.id).keys()]).toEqual([turnId]);
  await db.delete(chats).where(eq(chats.id, room.id));
  expect(await bus.emit({ type: "turnAborted", chatId: room.id, turnId, intent: "send", reason: "user", automationDepth: 0 })).toBeNull();
  expect(bus.openTurns(room.id).size).toBe(0);
});

test("a terminal whose append is lost still closes its turn on the bus and comes back without a cursor", async ({ harness, db, clock, ids }): Promise<void> => {
  const { room } = await hostedRoom(harness);
  const bus = createChatBus({ db: databaseHandle(db), logger: createTestLogger(), now: clock.now, newEventId: () => ids.typeId(ID_PREFIX.chatEvent) });
  const turnId = ids.typeId(ID_PREFIX.chatTurn);
  await bus.emit({ type: "turnAccepted", chatId: room.id, turnId, intent: "send", speakerCharacterId: null, targetMessageId: null });
  await using _refusal = await refuseWrites(harness.db, {
    table: chatEvents,
    event: "INSERT",
    when: `NEW."type" = 'turnAborted'`,
    message: "controlled terminal refusal",
  });
  const aborted = { type: "turnAborted", chatId: room.id, turnId, intent: "send", reason: "error", automationDepth: 0 } as const;
  // Not `null`: that answer is reserved for a chat that is gone, which never fans (D342).
  expect(await bus.emit(aborted)).toEqual({ seq: null, event: aborted });
  expect(bus.openTurns(room.id).size).toBe(0);
});
