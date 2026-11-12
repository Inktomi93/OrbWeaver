// A host's nav-away reap from one session and a first send from another exclude each other on the server:
// the reap never deletes a room while admitted work is in it, and a send never runs into a room mid-delete.
// @subject packages/server/src/domain/chat/verbs/chat-lifecycle.ts
// @subject packages/server/src/domain/chat/substrate/handoff-barrier.ts

import { createPersonaSchema } from "@orb/contracts/persona";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { freshHeldDb, readRoomCanon } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { textRoom } from "../scenario-physical.ts";

// The claim's own first read: a send parked here has passed every check and has not claimed or written.
const CLAIM_READ = /^select "created_at" from "chats"/u;
const ROOM_DELETE = /^delete from "chats"/u;
const NOT_FOUND = { code: "NOT_FOUND" } as const;

const listed = async (h: ChatRoot): Promise<boolean> => (await h.root.services.chat.listChats({ principal: h.owner })).items.some(({ id }) => id === h.chatId);

interface FirstWrite {
  readonly name: string;
  readonly replies: readonly string[];
  readonly write: (h: ChatRoot) => Promise<unknown>;
  readonly canon: readonly string[];
}

const REPLY = "The first reply.";

// Each verb enters through the same admission and claims through the same read, so one hold parks each.
const FIRST_WRITES: readonly FirstWrite[] = [
  {
    name: "send",
    replies: [REPLY],
    write: (h) => h.caller.chat.send({ chatId: h.chatId, content: "hello", timeZone: UTC_TIME_ZONE }),
    canon: ["hello", REPLY],
  },
  {
    name: "commitMessage",
    replies: [],
    write: (h) => h.caller.chat.commitMessage({ chatId: h.chatId, content: "hello", timeZone: UTC_TIME_ZONE }),
    canon: ["hello"],
  },
  {
    name: "generate",
    replies: [REPLY],
    write: (h) => h.caller.chat.generate({ chatId: h.chatId, timeZone: UTC_TIME_ZONE }),
    canon: [REPLY],
  },
];

test.for(FIRST_WRITES)(
  "a reap from a second session while a first $name is before its claim leaves the room and the line",
  async ({ replies, write, canon }) => {
    using held = await freshHeldDb();
    await using h = await textRoom(replies, { server: { db: held.db } });
    const otherSession = await h.root.internalCallerFor(h.owner.userId);
    const claimRead = held.hold(CLAIM_READ);

    const writing = write(h);
    await claimRead.reached;
    expect(await listed(h)).toBe(false);
    await otherSession.chat.reapHusk({ chatId: h.chatId });
    claimRead.release();
    await writing;

    expect(await listed(h)).toBe(true);
    expect((await readRoomCanon(h.root, h.owner, h.chatId)).map(({ content }) => content)).toEqual(canon);
  },
);

test("a send that arrives while the reap is deleting is refused, and one after the reap finds no room and writes nothing", async () => {
  using held = await freshHeldDb();
  await using h = await textRoom([], { server: { db: held.db } });
  const otherSession = await h.root.internalCallerFor(h.owner.userId);
  const roomDelete = held.hold(ROOM_DELETE);

  const reaping = otherSession.chat.reapHusk({ chatId: h.chatId });
  await roomDelete.reached;
  await expect(h.caller.chat.send({ chatId: h.chatId, content: "hello", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.locked },
  });
  roomDelete.release();
  await reaping;

  await expect(h.caller.chat.send({ chatId: h.chatId, content: "hello", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject(NOT_FOUND);
  await expect(h.caller.chat.getChat({ chatId: h.chatId })).rejects.toMatchObject(NOT_FOUND);
  expect(await h.root.services.stats.overview(h.owner.userId)).toBeNull();
});

test("a refused first send releases the room, so a reap after it still removes the unstarted room", async () => {
  await using h = await textRoom([]);
  const otherSession = await h.root.internalCallerFor(h.owner.userId);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const foreign = await h.root.services.persona.create({
    principal: stranger,
    input: createPersonaSchema.parse({ name: "Private stranger", description: "A stranger-owned private persona." }),
  });

  await expect(h.caller.chat.send({ chatId: h.chatId, content: "hello", personaId: foreign.id, timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
    cause: { code: CHAT_OP_CODES.notPersonaOwner },
  });
  expect(await h.caller.chat.getChat({ chatId: h.chatId })).toMatchObject({ id: h.chatId });
  await otherSession.chat.reapHusk({ chatId: h.chatId });

  await expect(h.caller.chat.getChat({ chatId: h.chatId })).rejects.toMatchObject(NOT_FOUND);
});
