// A device that attaches to the chat room with no cursor while a turn streams receives that turn so far, in one
// fold, then the live tail, through the real socket and under each viewer's scope.
// @subject packages/server/src/transport/trpc/stream/sources/chat.ts
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { vi } from "vitest";
import { z } from "zod";
import { signedInMember } from "../../../entry/_auth-roots.ts";
import {
  AFTER_JOIN,
  admit,
  BEFORE_JOIN,
  channelOf,
  ended,
  FULL_TEXT,
  OPENING,
  openDevice,
  openRoom,
  SECRET_HEAD,
  SECRET_TAIL,
  THOUGHT,
  textOf,
  tokenCount,
  typesOf,
} from "./_held-room.ts";

// A reload, a second tab and a second device reach the server as this one attach: a fresh socket with no cursor.
test("a device with no cursor shows the turn so far at once, then the live tail, with one copy of every token", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    const types = typesOf(device.frames);
    expect(types[0]).toBe("chatOpened");
    expect(types.indexOf("turnStarted")).toBeGreaterThan(0);
    expect(types.indexOf("turnStarted")).toBeLessThan(types.indexOf("delta"));
    // One fold per channel, however many tokens it covers: the reasoning run, then the text run.
    expect(device.frames.filter(({ event }) => event.type === "delta").map(({ event }) => event.type === "delta" && event.delta.kind)).toEqual([
      "reasoning",
      "text",
    ]);
    expect(channelOf(device.frames, "reasoning")).toBe(THOUGHT);

    room.reply().release();
    await turn;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe(FULL_TEXT);
    expect(channelOf(device.frames, "reasoning")).toBe(THOUGHT);
    const seqs = device.frames.filter(({ event }) => event.type !== "chatOpened").map(({ seq }) => seq);
    expect(seqs).toEqual([...new Set(seqs)].toSorted((a, b) => a - b));
  } finally {
    await device.close();
  }
});

test("a member who opens the room inside a hidden span reads only the bytes the live stream gives a member", async () => {
  await using room = await openRoom();
  const member = await admit(room, "late-join-member");
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, member.id, member.cookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).startsWith(OPENING));
    room.reply().release();
    await turn;
    await device.waitFor(ended);
    const bytes = JSON.stringify(device.frames);
    expect(bytes).not.toContain(SECRET_HEAD);
    expect(bytes).not.toContain(SECRET_TAIL);
    expect(textOf(device.frames)).toContain(OPENING);
    expect(textOf(device.frames)).toContain("The close lands live.");
  } finally {
    await device.close();
  }
});

test("a seat that holds no chair in the room gets no frame of the turn", async () => {
  await using room = await openRoom();
  const outsider = await signedInMember(room.root, castId<Handle>("late-join-outsider"));
  const seated = await admit(room, "late-join-seated");
  const turn = room.send();
  await room.tokensLogged();
  const stranger = await openDevice(room.root, outsider.id, outsider.cookie, room.chatId);
  const barrier = await openDevice(room.root, seated.id, seated.cookie, room.chatId);
  try {
    await stranger.attach();
    await barrier.attach();
    await barrier.waitFor((frames) => textOf(frames).length > 0);
    room.reply().release();
    await turn;
    await barrier.waitFor(ended);
    expect(stranger.frames).toEqual([]);
  } finally {
    await stranger.close();
    await barrier.close();
  }
});

test("a from-join member attaching while the host rerolls a pre-join row gets none of its tokens", async () => {
  await using room = await openRoom();
  const first = room.send();
  await room.tokensLogged();
  room.reply().release();
  const outcome = z.object({ messages: z.array(z.object({ id: z.string(), role: z.string() })) }).parse(await first);
  const target = outcome.messages.find((message) => message.role === "assistant");
  if (target === undefined) {
    throw new Error("the first turn committed no assistant row");
  }
  await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "the join anchor" });
  const member = await admit(room, "late-join-floored");
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId: room.chatId, userId: member.id, visibility: "from-join" });
  room.rearm();
  const swipe = room.root.services.chat.swipe({ principal: room.host, chatId: room.chatId, messageId: castId(target.id) });
  await room.tokensLogged(2 * tokenCount + AFTER_JOIN.length);
  const device = await openDevice(room.root, member.id, member.cookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => typesOf(frames).includes("turnStarted"));
    room.reply().release();
    await swipe;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe("");
    expect(channelOf(device.frames, "reasoning")).toBe("");
  } finally {
    await device.close();
  }
});

test("a turn that aborts mid-replay closes the joiner's ghost, and a device arriving after it opens no ghost", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  const late = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).length > 0);
    await room.root.services.chat.abort({ principal: room.host, chatId: room.chatId });
    room.reply().fail();
    await turn.catch(() => undefined);
    await device.waitFor(ended);
    await late.attach();
    await late.waitFor((frames) => frames.length > 0);
    await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "the barrier row" });
    await late.waitFor((frames) => typesOf(frames).includes("messageCommitted"));
    expect(typesOf(late.frames).filter((type) => type === "delta" || type === "turnStarted" || type === "turnAccepted")).toEqual([]);
  } finally {
    await device.close();
    await late.close();
  }
});

test("a swipe in flight reaches a joiner as a swipe of its target, carrying only the new generation", async () => {
  await using room = await openRoom();
  const first = room.send();
  await room.tokensLogged();
  room.reply().release();
  const outcome = z.object({ messages: z.array(z.object({ id: z.string(), role: z.string() })) }).parse(await first);
  const target = outcome.messages.find((message) => message.role === "assistant");
  if (target === undefined) {
    throw new Error("the first turn committed no assistant row");
  }
  room.rearm();
  const logged = tokenCount + AFTER_JOIN.length;
  const swipe = room.root.services.chat.swipe({ principal: room.host, chatId: room.chatId, messageId: castId(target.id) });
  await room.tokensLogged(logged + tokenCount);
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    const opened = device.frames.find(({ event }) => event.type === "turnStarted")?.event;
    expect(opened).toMatchObject({ intent: "swipe", targetMessageId: target.id });
    room.reply().release();
    await swipe;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe(FULL_TEXT);
  } finally {
    await device.close();
  }
});

test("a refused send during a turn leaves a joiner the whole ghost", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  await room.send();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => typesOf(frames).includes("chatOpened"));
    room.reply().release();
    await turn;
    await device.waitFor(ended);
    expect(typesOf(device.frames)).toContain("turnStarted");
    expect(textOf(device.frames)).toBe(FULL_TEXT);
  } finally {
    await device.close();
  }
});

test("a generate finishing beside a send leaves a joiner the send's ghost", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const held = room.reply();
  room.answerWith("A side reply lands.");
  await room.root.services.chat.generate({ principal: room.host, chatId: room.chatId });
  const joiner = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await joiner.attach();
    await joiner.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    held.release();
    await turn;
    await joiner.waitFor((frames) => textOf(frames) === FULL_TEXT);
    expect(typesOf(joiner.frames)).toContain("turnStarted");
  } finally {
    await joiner.close();
  }
});

test("a device that drops after its attach notice reconnects at a floor that replays the turn's head", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  const revived = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).length > 0);
    const floor = device.frames.find(({ event }) => event.type === "chatOpened")?.seq;
    const caller = await room.root.internalCallerFor(room.host.userId);
    await caller.stream.attach({ socketId: revived.socketId, ref: { channel: "chat", chatId: room.chatId }, sinceSeq: floor ?? null });
    await revived.waitFor((frames) => textOf(frames) === BEFORE_JOIN.join(""));
    expect(typesOf(revived.frames)).toContain("turnStarted");
    room.reply().release();
    await turn;
  } finally {
    await device.close();
    await revived.close();
  }
});

test("a joiner gets the turn's user row even when its own list predates it", async () => {
  await using room = await openRoom();
  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => textOf(frames).length > 0);
    const commit = device.frames.find(({ event }) => event.type === "messageCommitted")?.event;
    expect(commit).toMatchObject({ view: { role: "user" } });
    room.reply().release();
    await turn;
  } finally {
    await device.close();
  }
});

test("a throw after a send's accept closes that turn, and the next turn's ghost reaches a joiner whole", async () => {
  await using room = await openRoom();
  await room.root.services.chat.setGroupConfig({ principal: room.host, chatId: room.chatId, config: { output: "narrator", policy: "list" } });
  const mint = vi.spyOn(room.root.services.character, "mintSyntheticGroupCharacter").mockRejectedValueOnce(new Error("the scripted mint failed"));
  await expect(room.send()).rejects.toThrow("the scripted mint failed");
  mint.mockRestore();
  const log = await room.root.services.chat.replayChatEvents({ principal: room.host, chatId: room.chatId });
  expect(log.map(({ event }) => event.type).slice(-2)).toEqual(["turnAccepted", "turnAborted"]);

  const turn = room.send();
  await room.tokensLogged();
  const device = await openDevice(room.root, room.host.userId, room.hostCookie, room.chatId);
  try {
    await device.attach();
    await device.waitFor((frames) => typesOf(frames).includes("chatOpened"));
    const started = (await room.root.services.chat.replayChatEvents({ principal: room.host, chatId: room.chatId })).findLast(
      ({ event }) => event.type === "turnStarted",
    );
    expect(device.frames[0]?.event).toMatchObject({ type: "chatOpened", openTurnIds: [started?.event.type === "turnStarted" ? started.event.turnId : null] });
    room.reply().release();
    await turn;
    await device.waitFor(ended);
    expect(textOf(device.frames)).toBe(FULL_TEXT);
  } finally {
    await device.close();
  }
});
