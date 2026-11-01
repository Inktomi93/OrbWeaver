// A reply cut inside a hidden tag stays hidden from members, and a continue that resumes it never hands them the tail.
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts
// @subject packages/server/src/domain/chat/verbs/fork.ts
// @subject packages/kit/src/content/index.ts

import type { ChatId, MessageId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { Device, Guest, Room } from "./_held-room.ts";
import { leaks, memberWatching, openRoom, SECRET_HEAD, SECRET_TAIL, storedMemberBytes, textOf } from "./_held-room.ts";

const OPENING = "A cut reply.";
const CUT_OPEN = `<lie character="Witness" truth="${SECRET_HEAD}`;
const CUT_BODY = `${OPENING} ${CUT_OPEN}`;
const MIDDLE_OF_SECRET = "still-inside-the-attr-";
const CLOSE = "The close lands.";
const CLOSED_TAIL = `${SECRET_TAIL}"/> ${CLOSE}`;

const carriesSecret = (bytes: string): boolean => bytes.includes(SECRET_HEAD) || bytes.includes(SECRET_TAIL) || bytes.includes(MIDDLE_OF_SECRET);

/** The room's one reply body as `principal` reads it. */
async function replyBody(room: Room, principal: Guest, chatId = room.chatId): Promise<{ readonly id: MessageId; readonly content: string }> {
  const { messages } = await room.root.services.chat.listMessages({ principal, chatId });
  const reply = messages.findLast((message) => message.role === "assistant");
  if (reply === undefined) {
    throw new Error("the room holds no reply");
  }
  return reply;
}

async function cutReply(room: Room): Promise<void> {
  room.answerWith(CUT_BODY);
  await room.send();
}

async function continueReply(room: Room, device: Device, text: string, arrived: (frames: Device["frames"]) => boolean): Promise<void> {
  const { id } = await replyBody(room, room.host);
  room.answerWith(text);
  await room.root.services.chat.continueTurn({ principal: room.host, chatId: room.chatId, messageId: id });
  await device.waitFor(arrived);
}

/** A non-host forks only once no other human remains. */
async function soleMemberFork(room: Room, guest: Guest): Promise<ChatId> {
  await room.root.services.chat.selfLeave({ principal: room.host, chatId: room.chatId });
  return (await room.root.services.chat.forkChat({ principal: guest, chatId: room.chatId })).chat.id;
}

const closeArrived = (frames: Device["frames"]): boolean => textOf(frames).includes(CLOSE);
const continueEnded = (frames: Device["frames"]): boolean => frames.filter(({ event }) => event.type === "turnCompleted").length >= 2;

test("a reply cut inside a hidden tag is hidden from members, verbatim for the host and literal to the model", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "cut-member");
  try {
    await cutReply(room);
    await device.waitFor((frames) => frames.some(({ event }) => event.type === "turnCompleted"));
    expect(await leaks(room, device, guest)).toEqual([]);
    expect(textOf(device.frames)).toContain(OPENING);
    expect((await replyBody(room, guest)).content.trim()).toBe(OPENING);
    expect((await replyBody(room, room.host)).content).toBe(CUT_BODY);
    expect(carriesSecret(JSON.stringify(await room.root.services.chat.listChats({ principal: guest })))).toBe(false);

    await room.root.services.chat.send({ principal: room.host, chatId: room.chatId, content: "Carry on." });
    expect(room.prompts().at(-1)).toContain(JSON.stringify(CUT_OPEN).slice(1, -1));

    const copy = await soleMemberFork(room, guest);
    expect(carriesSecret(JSON.stringify(await room.root.services.chat.listMessages({ principal: guest, chatId: copy })))).toBe(false);
  } finally {
    await device.close();
  }
});

test("a continue that closes the open tag gives a member only the prose past the close", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "continue-member");
  try {
    await cutReply(room);
    await continueReply(room, device, CLOSED_TAIL, closeArrived);
    expect(await leaks(room, device, guest)).toEqual([]);
    expect(await storedMemberBytes(room)).toContain(CLOSE);
    expect((await replyBody(room, guest)).content).toContain(CLOSE);
    expect(carriesSecret((await replyBody(room, guest)).content)).toBe(false);
    // The control: the same bytes reach the host, so the strip above removed something real.
    expect((await replyBody(room, room.host)).content).toContain(SECRET_TAIL);
  } finally {
    await device.close();
  }
});

test("a fork by a member carries nothing of a continued secret through undo or redo", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "continue-forker");
  try {
    await cutReply(room);
    await continueReply(room, device, CLOSED_TAIL, closeArrived);
    const chatId = await soleMemberFork(room, guest);
    const { id: messageId, content } = await replyBody(room, guest, chatId);
    expect(carriesSecret(content)).toBe(false);
    // The forker is host of the copy, so these read the stored twins with no member strip in the way.
    const undone = await room.root.services.chat.undoContinue({ principal: guest, chatId, messageId });
    expect(carriesSecret(undone.content)).toBe(false);
    const redone = await room.root.services.chat.revertContinue({ principal: guest, chatId, messageId });
    expect(carriesSecret(redone.content)).toBe(false);
    expect(redone.content).toContain(CLOSE);
  } finally {
    await device.close();
  }
});

test.each([
  ["a literal open", "She would <lie down on the bed.", " Then she slept."],
  ["a bare bracket", "Four is <", " five."],
])("a member's fork keeps the prose a continue added after %s through undo and redo", async (_name, body, addition) => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "literal-forker");
  try {
    room.answerWith(body);
    await room.send();
    await continueReply(room, device, addition, continueEnded);
    const chatId = await soleMemberFork(room, guest);
    const { id: messageId } = await replyBody(room, guest, chatId);
    expect((await room.root.services.chat.undoContinue({ principal: guest, chatId, messageId })).content).toBe(body);
    expect((await room.root.services.chat.revertContinue({ principal: guest, chatId, messageId })).content).toBe(body + addition);
  } finally {
    await device.close();
  }
});

test("a span held across two continues stays hidden until the second closes it", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "two-continues");
  try {
    await cutReply(room);
    await continueReply(room, device, MIDDLE_OF_SECRET, continueEnded);
    expect(textOf(device.frames)).not.toContain(MIDDLE_OF_SECRET);
    expect(carriesSecret((await replyBody(room, guest)).content)).toBe(false);
    await continueReply(room, device, CLOSED_TAIL, closeArrived);
    expect(await leaks(room, device, guest)).toEqual([]);
    expect(carriesSecret(await storedMemberBytes(room))).toBe(false);
    expect((await replyBody(room, guest)).content).toContain(CLOSE);
  } finally {
    await device.close();
  }
});

test("an upper-case open held across a continue stays out of a member's bytes and their fork", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "upper-continue");
  try {
    room.answerWith(`${OPENING} ${CUT_OPEN.replace("<lie", "<LIE")}`);
    await room.send();
    await continueReply(room, device, CLOSED_TAIL, closeArrived);
    expect(await leaks(room, device, guest)).toEqual([]);
    const chatId = await soleMemberFork(room, guest);
    const { id: messageId } = await replyBody(room, guest, chatId);
    expect(carriesSecret((await room.root.services.chat.undoContinue({ principal: guest, chatId, messageId })).content)).toBe(false);
    expect(carriesSecret((await room.root.services.chat.revertContinue({ principal: guest, chatId, messageId })).content)).toBe(false);
  } finally {
    await device.close();
  }
});

test("a swipe of a cut reply is a new body, so its bytes reach the member from the first token", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "swipe-member");
  try {
    await cutReply(room);
    const { id } = await replyBody(room, room.host);
    room.answerWith(CLOSE);
    await room.root.services.chat.swipe({ principal: room.host, chatId: room.chatId, messageId: id });
    await device.waitFor(closeArrived);
    expect((await replyBody(room, guest)).content).toBe(CLOSE);
  } finally {
    await device.close();
  }
});
