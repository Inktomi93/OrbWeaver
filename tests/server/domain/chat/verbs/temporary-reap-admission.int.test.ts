// The temporary-chat sweep and admitted room work exclude each other on the server, as the husk reap does: a sweep
// past the TTL never deletes a room while a turn runs in it, and picks the room up on a later pass; a send that
// meets the sweep's delete is refused as a closing room.
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/server/src/domain/chat/substrate/handoff-barrier.ts

import { TURN_ROOM_CLOSING_OP_CODE } from "@orb/contracts/chat";
import { CANON_RETIREMENT_ATTEMPTS } from "@orb/contracts/stats";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { MS_PER_HOUR, UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { createChatRoot, freshHeldDb, readRoomCanon } from "@orb/testkit/node/composed";
import { z } from "zod";
import { textProvider, textRoom } from "../scenario-physical.ts";

const ROOM_DELETE = /^delete from "chats"/u;
// A room delete with canon in scope opens with this guard on the owner's canon version.
const CANON_GUARD = /^insert into "stats_canon_versions".*\(SELECT COALESCE\(\(SELECT version FROM stats_canon_versions/u;
const LOG_SCAN_LIMIT = 500;
const logRecordSchema = z.looseObject({ level: z.string(), chatId: typeIdSchema(ID_PREFIX.chat).optional() });
const NOT_FOUND = { code: "NOT_FOUND" } as const;
const REPLY = "The reply.";

// The root's own room is a husk the sweep would also reap; titling it claims it, so the sweep's cohort is the
// temporary rooms each case opens.
async function temporaryRooms(h: ChatRoot, count: number): Promise<ChatId[]> {
  await h.caller.chat.updateTitle({ chatId: h.chatId, title: "Kept" });
  const characterIds = h.characters.map(({ id }) => id);
  const rooms: ChatId[] = [];
  for (let i = 0; i < count; i += 1) {
    rooms.push((await h.caller.chat.startChat({ characterIds, opening: "none", temporary: true })).chat.id);
  }
  return rooms;
}

// Move the clock past the owner's own temporary-chat TTL, so every room opened so far has expired.
async function expireTemporaryRooms(h: ChatRoot): Promise<void> {
  const { tempChatTtlHours } = (await h.caller.settings.getUserSettings()).config.chat;
  h.root.clock.advance(tempChatTtlHours * MS_PER_HOUR + 1);
}

test("a sweep past the TTL keeps a temporary room whose turn is still running and deletes an idle one, and a sweep after the turn settles deletes it", async () => {
  using provider = textProvider([REPLY]);
  const arrived = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // The chat completion waits, so the send holds the room's admitted work until the test lets it finish.
  const providerFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions")) {
      arrived.resolve();
      await release.promise;
    }
    return await provider.execute(request);
  };
  await using h = await createChatRoot({ memoryEnabled: false, providerFetch });
  const [busy, idle] = await temporaryRooms(h, 2);
  if (busy === undefined || idle === undefined) {
    throw new Error("the case opened fewer than two temporary rooms");
  }
  await expireTemporaryRooms(h);

  const sending = h.caller.chat.send({ chatId: busy, content: "hello", timeZone: UTC_TIME_ZONE });
  const sent = Promise.allSettled([sending]);
  try {
    await arrived.promise;
    expect(await h.caller.chat.reapTemporaryChats()).toEqual({ reaped: 1 });
    await expect(h.caller.chat.getChat({ chatId: idle })).rejects.toMatchObject(NOT_FOUND);
    expect(await h.caller.chat.getChat({ chatId: busy })).toMatchObject({ id: busy });
  } finally {
    release.resolve();
    await sent;
  }
  await sending;
  await h.root.settleBackground();
  expect((await readRoomCanon(h.root, h.owner, busy)).map(({ content }) => content)).toEqual(["hello", REPLY]);

  expect(await h.caller.chat.reapTemporaryChats()).toEqual({ reaped: 1 });
  await expect(h.caller.chat.getChat({ chatId: busy })).rejects.toMatchObject(NOT_FOUND);
});

test("a sweep deletes the caller's expired temporary rooms, started or not, and keeps a fresh temporary room, a started ordinary room and another host's expired temporary room", async () => {
  await using h = await textRoom([], { memoryEnabled: false });
  const member = await h.root.principalFor((await h.root.actor()).id);
  const memberCaller = await h.root.internalCallerFor(member.userId);
  const [idle, started] = await temporaryRooms(h, 2);
  const theirs = (await memberCaller.chat.startChat({ characterIds: [], opening: "none", temporary: true })).chat.id;
  if (idle === undefined || started === undefined) {
    throw new Error("the case opened fewer than two temporary rooms");
  }
  // A line in the room starts it, so only the temporary arm of the sweep can take it, never the husk arm.
  await h.caller.chat.commitMessage({ chatId: started, content: "hello", timeZone: UTC_TIME_ZONE });
  await h.root.settleBackground();
  await expireTemporaryRooms(h);
  const [fresh] = await temporaryRooms(h, 1);
  if (fresh === undefined) {
    throw new Error("the case opened no fresh temporary room");
  }

  expect(await h.caller.chat.reapTemporaryChats()).toEqual({ reaped: 2 });
  for (const gone of [idle, started]) {
    await expect(h.caller.chat.getChat({ chatId: gone })).rejects.toMatchObject(NOT_FOUND);
  }
  // The ordinary room, titled by the helper, is as old as the swept ones.
  for (const kept of [fresh, h.chatId]) {
    expect(await h.caller.chat.getChat({ chatId: kept })).toMatchObject({ id: kept });
  }
  // The sweep is per host: the other host's room is expired and eligible, and survives only because it is theirs.
  expect(await memberCaller.chat.getChat({ chatId: theirs })).toMatchObject({ id: theirs });
  expect(await memberCaller.chat.reapTemporaryChats()).toEqual({ reaped: 1 });
  await expect(memberCaller.chat.getChat({ chatId: theirs })).rejects.toMatchObject(NOT_FOUND);
});

test("a sweep whose delete of one room a live write outruns on every attempt skips that room, logs it once and deletes the others", async () => {
  using held = await freshHeldDb();
  await using h = await textRoom([], { memoryEnabled: false, server: { db: held.db, logLevel: "warn" } });
  const rooms = await temporaryRooms(h, 3);
  const [first, poisoned, last] = rooms;
  if (first === undefined || poisoned === undefined || last === undefined) {
    throw new Error("the case opened fewer than three temporary rooms");
  }
  // A line starts each room, so each delete retires canon behind the guard on the owner's canon.
  for (const chatId of rooms) {
    await h.caller.chat.commitMessage({ chatId, content: "hello", timeZone: UTC_TIME_ZONE });
  }
  await h.root.settleBackground();
  await expireTemporaryRooms(h);

  // The sweep deletes in id order, so the guard's second through fourth batches are the poisoned room's attempts.
  const racedHits = new Set(Array.from({ length: CANON_RETIREMENT_ATTEMPTS }, (_, index) => index + 2));
  let gate = held.hold(CANON_GUARD);
  const sweeping = h.caller.chat.reapTemporaryChats().then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );
  let hits = 0;
  try {
    for (;;) {
      const step = await Promise.race([gate.reached.then(() => "held" as const), sweeping.then(() => "settled" as const)]);
      if (step === "settled") {
        break;
      }
      hits += 1;
      gate.disarm();
      if (racedHits.has(hits)) {
        // A write in the kept ordinary room moves the owner's canon, so the parked guard refuses.
        await h.root.app.chatRpgOps.postNarratorMessage(h.chatId, `The scene moves ${String(hits)}.`);
      }
      const parked = gate;
      gate = held.hold(CANON_GUARD);
      parked.release();
    }
  } finally {
    gate.release();
  }

  expect(await sweeping).toEqual({ result: { reaped: 2 } });
  expect(hits).toBe(CANON_RETIREMENT_ATTEMPTS + 2);
  for (const gone of [first, last]) {
    await expect(h.caller.chat.getChat({ chatId: gone })).rejects.toMatchObject(NOT_FOUND);
  }
  expect(await h.caller.chat.getChat({ chatId: poisoned })).toMatchObject({ id: poisoned });
  const warned = h.root.observability
    .logLines(LOG_SCAN_LIMIT)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter((record) => record.level === "warn" && record.chatId === poisoned);
  expect(warned).toHaveLength(1);
  // Control: with no writer racing it, the next sweep takes the room it skipped.
  expect(await h.caller.chat.reapTemporaryChats()).toEqual({ reaped: 1 });
  await expect(h.caller.chat.getChat({ chatId: poisoned })).rejects.toMatchObject(NOT_FOUND);
});

test("a send that arrives while the sweep is deleting a temporary room is refused as a closing room, and one after finds no room", async () => {
  using held = await freshHeldDb();
  await using h = await textRoom([], { server: { db: held.db } });
  const [room] = await temporaryRooms(h, 1);
  if (room === undefined) {
    throw new Error("the case opened no temporary room");
  }
  await expireTemporaryRooms(h);
  const roomDelete = held.hold(ROOM_DELETE);

  const sweeping = h.caller.chat.reapTemporaryChats();
  await roomDelete.reached;
  await expect(h.caller.chat.send({ chatId: room, content: "hello", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    code: "BAD_REQUEST",
    cause: { code: TURN_ROOM_CLOSING_OP_CODE },
  });
  roomDelete.release();
  expect(await sweeping).toEqual({ reaped: 1 });

  await expect(h.caller.chat.send({ chatId: room, content: "hello", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject(NOT_FOUND);
  await expect(h.caller.chat.getChat({ chatId: room })).rejects.toMatchObject(NOT_FOUND);
});
