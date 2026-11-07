// A reply a broken hidden tag cut short for members tells the host once. No member learns it by any delivery path.
// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/substrate/member-visibility.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { HIDDEN_TAG_BROKEN_CODE } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { Device, Room } from "./_held-room.ts";
import { ended, memberWatching, openDevice, openRoom, SECRET_HEAD, textOf } from "./_held-room.ts";

const BROKEN = ["Opening. ", '<LIE character="Witness" ', `truth="${SECRET_HEAD}">`, " The story goes on."];
const CLEAN = "A clean reply lands.";
const OVER_HIDDEN_BOUND = "x".repeat(17_000);

const isBrokenTagWarning = (event: ChatBusEvent): boolean => event.type === "warning" && event.code === HIDDEN_TAG_BROKEN_CODE;

const warningsIn = (frames: Device["frames"]): readonly ChatBusEvent[] => frames.flatMap(({ event }) => (isBrokenTagWarning(event) ? [event] : []));

async function replayedWarnings(room: Room, principal: Room["host"]): Promise<readonly ChatBusEvent[]> {
  const log = await room.root.services.chat.replayChatEvents({ principal, chatId: room.chatId });
  return log.flatMap(({ event }) => (isBrokenTagWarning(event) ? [event] : []));
}

async function hostDevice(room: Room): Promise<Device> {
  const device = await openDevice(room, room.hostSeat);
  await device.attach();
  await device.waitFor((frames) => frames.length > 0);
  return device;
}

test("a broken tag warns the host once across its chunks and reaches no member live or on replay", async () => {
  await using room = await openRoom();
  const host = await hostDevice(room);
  const { device: member, guest } = await memberWatching(room, "warned-member");
  try {
    room.answerInChunks(BROKEN);
    await room.send();
    await host.waitFor(ended);
    await member.waitFor(ended);
    expect(warningsIn(host.frames)).toEqual([{ type: "warning", chatId: room.chatId, code: HIDDEN_TAG_BROKEN_CODE }]);
    expect(await replayedWarnings(room, room.host)).toHaveLength(1);
    expect(warningsIn(member.frames)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await host.close();
    await member.close();
  }
});

test("a member who joins after the warning never receives it, and a later clean turn raises none", async () => {
  await using room = await openRoom();
  room.answerInChunks(BROKEN);
  await room.send();
  const { device: late, guest } = await memberWatching(room, "late-member");
  try {
    room.answerWith(CLEAN);
    await room.send();
    await late.waitFor((frames) => textOf(frames).includes(CLEAN));
    expect(warningsIn(late.frames)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
    expect(await replayedWarnings(room, room.host)).toHaveLength(1);
  } finally {
    await late.close();
  }
});

test.each([
  ["an unclosed quote", `Opening. <lie truth="${SECRET_HEAD}\n\nThree paragraphs members lose.`],
  ["a quote its own backslash left open", `Opening. <lie truth="C:\\"/>\n\nThree paragraphs members lose.`],
  ["a tag past the hidden scan bound", `Opening. <lie truth="${OVER_HIDDEN_BOUND}"/> Three paragraphs members lose.`],
  ["a nest past the pass bound", `Opening. ${"<l".repeat(12)}<lie a="1"/>${'ie a="1"/>'.repeat(12)} Three paragraphs members lose.`],
])("%s that hides the rest of a finished reply warns the host alone", async (_name, body) => {
  await using room = await openRoom();
  const { device: member, guest } = await memberWatching(room, "unfinished-member");
  try {
    room.answerWith(body);
    await room.send();
    await member.waitFor(ended);
    expect(await replayedWarnings(room, room.host)).toHaveLength(1);
    expect(warningsIn(member.frames)).toEqual([]);
    expect(await replayedWarnings(room, guest)).toEqual([]);
  } finally {
    await member.close();
  }
});

test.each([
  ["the output limit", "length"],
  ["the content filter", "content_filter"],
])("%s cutting a reply inside a tag raises no warning", async (_name, finishReason) => {
  await using room = await openRoom();
  room.answerInChunks([`Opening. <lie truth="${SECRET_HEAD}`], finishReason);
  await room.send();
  expect(await replayedWarnings(room, room.host)).toEqual([]);
});

test("a broken tag warns even on a reply the output limit cut off", async () => {
  await using room = await openRoom();
  room.answerInChunks(BROKEN, "length");
  await room.send();
  expect(await replayedWarnings(room, room.host)).toHaveLength(1);
});

test.each([
  ["a closed tag", `Opening. <LIE truth="${SECRET_HEAD}"/> The end.`],
  ["prose", "She will <lie down on the bed."],
])("%s raises no warning", async (_name, body) => {
  await using room = await openRoom();
  room.answerWith(body);
  await room.send();
  expect(await replayedWarnings(room, room.host)).toEqual([]);
});

test("a member's search cannot confirm the words of an upper-case tag", async () => {
  await using room = await openRoom();
  const { device, guest } = await memberWatching(room, "search-member");
  try {
    room.answerWith(`Opening. <LIE truth="${SECRET_HEAD}"/>`);
    await room.send();
    const titles = async (principal: Room["host"]): Promise<number> =>
      (await room.root.services.chat.listChats({ principal, search: SECRET_HEAD })).items.length;
    expect(await titles(room.host)).toBe(1);
    expect(await titles(guest)).toBe(0);
  } finally {
    await device.close();
  }
});
