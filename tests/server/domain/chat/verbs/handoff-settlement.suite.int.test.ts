// @subject packages/server/src/domain/chat/verbs/admission.ts
// @subject packages/server/src/domain/chat/substrate/handoff-barrier.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import { setImmediate as physicalTurn } from "node:timers/promises";
import { createCharacterSchema } from "@orb/contracts/character";
import { MANAGED_VERBATIM_TAIL } from "@orb/contracts/preset";
import { characters, chatLocks, chatParticipants, chats, closeDb, messages, messageVariants, ownerStats, pendingTurns, rpgSnapshots } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { CHAT_OP_CODES, ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { freshHeldDb } from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";
import { sdkEngineRoom } from "../engine/engine-physical.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import type { SpeakerRoom } from "./speaker-funding-physical.ts";
import { B_CHAT_MODEL, B_HOST_KEY, saveSpeakerConnection, speakerInputs, speakerRoom } from "./speaker-funding-physical.ts";
import { turnRpgReply, turnRpgRoom } from "./turn-rpg-physical.ts";

const ARIA = createCharacterSchema.parse({ handle: "owed-aria", name: "Aria", description: "Only the outgoing owner knows this travelling knight." });
const LIST = { output: "per-speaker", policy: "list", allowSelfResponses: true } as const;
const NEXT_KEY = "owned-settlement-recipient-key";

function providerRefusal(): Response {
  return Response.json({ error: { message: "Controlled owed response refusal", type: "invalid_request_error" } }, { status: 400 });
}

async function queued(room: SpeakerRoom, member: SpeakerRoom["h"]["owner"], content = "The member is owed a reply."): Promise<void> {
  const result = await room.h.root.services.chat.send({ principal: member, chatId: room.h.chatId, content, timeZone: UTC_TIME_ZONE });
  expect(result.aborted).toBe(false);
  expect(result.messages.map((m) => m.role)).toEqual(["user"]);
}

async function nominee(room: SpeakerRoom): Promise<SpeakerRoom["h"]["owner"]> {
  const { h } = room;
  const recipient = await invitePerson(h);
  await saveSpeakerConnection(h, room.peer.baseUrl, "chat", { principal: recipient, key: NEXT_KEY });
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: recipient.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  return recipient;
}

async function debt(room: SpeakerRoom): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await room.h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, room.h.chatId)).orderBy(pendingTurns.createdAt, pendingTurns.id);
}

async function canon(room: SpeakerRoom): Promise<(typeof messages.$inferSelect)[]> {
  return await room.h.root.db.select().from(messages).where(eq(messages.chatId, room.h.chatId)).orderBy(messages.seq);
}

async function stillOutgoing(room: SpeakerRoom, recipient: SpeakerRoom["h"]["owner"]): Promise<void> {
  const { h } = room;
  expect(await h.root.db.select().from(characters).where(eq(characters.ownerId, recipient.userId))).toEqual([]);
  expect(
    await h.root.db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.role, "host"))),
  ).toMatchObject([{ userId: h.owner.userId, leftSeq: null }]);
  expect(await h.root.db.select().from(chats).where(eq(chats.id, h.chatId)).get()).toMatchObject({ pendingHostUserId: recipient.userId });
}

async function transferred(room: SpeakerRoom, recipient: SpeakerRoom["h"]["owner"]): Promise<void> {
  const { h } = room;
  expect(
    await h.root.db
      .select()
      .from(chatParticipants)
      .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.role, "host"))),
  ).toMatchObject([{ userId: recipient.userId, leftSeq: null }]);
  const copies = await h.root.db.select().from(characters).where(eq(characters.ownerId, recipient.userId));
  expect(copies).toHaveLength(1);
  expect(copies[0]?.id).not.toBe(h.characters[0]?.id);
  expect(await h.root.services.chat.listParticipants({ principal: recipient, chatId: h.chatId })).toEqual(
    expect.arrayContaining([expect.objectContaining({ characterId: copies[0]?.id, leftSeq: null })]),
  );
}

test("a wrong nominee or outsider cannot close admission or make the outgoing host settle debt", async () => {
  await using room = await speakerRoom({ chat: ["The authorized acceptance settles this."] }, { characters: [ARIA], group: LIST });
  const member = await invitePerson(room.h);
  const recipient = await nominee(room);
  const outsider = await room.h.root.principalFor((await room.h.root.actor()).id);
  await queued(room, member);
  const before = await debt(room);
  await expect(room.h.root.services.chat.acceptHostHandoff({ principal: member, chatId: room.h.chatId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notTurnOwner,
  });
  await expect(room.h.root.services.chat.acceptHostHandoff({ principal: outsider, chatId: room.h.chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
  expect(await debt(room)).toEqual(before);
  expect((await canon(room)).map((m) => m.role)).toEqual(["user"]);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
  await stillOutgoing(room, recipient);
  await room.h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: room.h.chatId });
  expect(await debt(room)).toEqual([]);
  await transferred(room, recipient);
});

test("a real provider refusal keeps the identical debt and authority before any property copy", async () => {
  await using room = await speakerRoom({ chatFailure: true }, { characters: [ARIA], group: LIST });
  const member = await invitePerson(room.h);
  const recipient = await nominee(room);
  await queued(room, member);
  const before = await debt(room);
  await expect(room.h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: room.h.chatId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.aborted,
  });
  expect(await debt(room)).toEqual(before);
  expect((await canon(room)).map((m) => m.role)).toEqual(["user"]);
  await stillOutgoing(room, recipient);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(1);
  expect(room.peer.requests.filter((r) => r.method === "POST").map((r) => r.headers.get("authorization"))).toEqual([`Bearer ${B_HOST_KEY}`]);
});

test("a later owed failure retains completed paid canon and retry executes only the remaining debt", async () => {
  await using room = await speakerRoom(
    { chat: ["The first debt really commits.", providerRefusal(), "Only the remaining debt is retried."] },
    { characters: [ARIA], group: LIST },
  );
  const { h } = room;
  const member = await invitePerson(h);
  const recipient = await nominee(room);
  await queued(room, member, "first owed request");
  await queued(room, member, "second owed request");
  const before = await debt(room);
  expect(before).toHaveLength(2);
  await expect(h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
  expect(await debt(room)).toEqual(before.slice(1));
  const paid = (await canon(room)).filter((m) => m.role === "assistant");
  expect(paid).toHaveLength(1);
  const paidVariantId = paid[0]?.selectedVariantId;
  if (paidVariantId === null || paidVariantId === undefined) {
    throw new Error("the actually committed reply has no selected variant");
  }
  expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, paidVariantId))).toMatchObject([
    { content: "The first debt really commits.", connectionId: room.connection.id, tokensIn: 4, tokensOut: 2 },
  ]);
  expect(await h.root.db.select().from(ownerStats).where(eq(ownerStats.ownerId, h.owner.userId)).get()).toMatchObject({
    assistantTurns: 1,
    tokensIn: 4,
    tokensOut: 2,
  });
  await stillOutgoing(room, recipient);
  await h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId });
  expect(await debt(room)).toEqual([]);
  expect((await canon(room)).filter((m) => m.role === "assistant").map((m) => m.id)).toContain(paid[0]?.id);
  expect((await canon(room)).filter((m) => m.role === "assistant")).toHaveLength(2);
  expect(room.peer.requests.filter((r) => r.method === "POST").map((r) => r.headers.get("authorization"))).toEqual(
    Array.from({ length: 3 }, () => `Bearer ${B_HOST_KEY}`),
  );
  await transferred(room, recipient);
  await expect(h.root.services.chat.drainDeferredTurns({ all: true })).resolves.toEqual({ ran: 0, dropped: 0 });
});

test("the real native engine lease refuses settlement without silently consuming the owed row", async () => {
  await using room = await speakerRoom({}, { characters: [ARIA], group: LIST });
  const { h } = room;
  const member = await invitePerson(h);
  const recipient = await nominee(room);
  await queued(room, member);
  const before = await debt(room);
  const holder = "owned-maintenance-turn-lease";
  await h.root.db.insert(chatLocks).values({ chatId: h.chatId, holder, acquiredAt: h.root.clock.now(), expiresAt: h.root.clock.now() + 60_000 });
  try {
    await expect(h.root.services.chat.drainDeferredTurns({ all: true })).resolves.toEqual({ ran: 0, dropped: 0 });
    expect(await debt(room)).toEqual(before);
    await expect(h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
    expect(await debt(room)).toEqual(before);
    await stillOutgoing(room, recipient);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toMatchObject([{ holder }]);
  } finally {
    await h.root.db.delete(chatLocks).where(and(eq(chatLocks.chatId, h.chatId), eq(chatLocks.holder, holder)));
  }
});

test("only the frozen initiator can stop a claimed drain and that aborted reply remains owed", async () => {
  await using room = await speakerRoom(
    { chat: ["The cancelled physical response is never canon.", providerRefusal()], holdChat: true },
    { characters: [ARIA], group: LIST },
  );
  const { h } = room;
  const member = await invitePerson(h);
  const recipient = await nominee(room);
  await queued(room, member);
  const before = await debt(room);
  const draining = h.root.services.chat.drainDeferredTurns({ all: true });
  const settled = Promise.allSettled([draining]);
  try {
    await room.peer.reached;
    expect(await debt(room)).toEqual([]);
    await expect(h.root.services.chat.abort({ principal: recipient, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notTurnOwner });
    await h.root.services.chat.abort({ principal: member, chatId: h.chatId });
    await expect(draining).resolves.toEqual({ ran: 0, dropped: 0 });
    expect(await debt(room)).toEqual(before);
    expect((await canon(room)).map((m) => m.role)).toEqual(["user"]);
    room.peer.release();
    await expect(h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
    expect(await debt(room)).toEqual(before);
    await stillOutgoing(room, recipient);
  } finally {
    room.peer.release();
    await settled;
  }
});

test("acceptance settles only this room while another room's frozen debt remains owed", async () => {
  await using room = await speakerRoom({ chat: ["Only the accepting room is answered."] }, { characters: [ARIA], group: LIST });
  const { h } = room;
  const member = await invitePerson(h);
  const recipient = await nominee(room);
  await queued(room, member);
  const other = await h.root.services.chat.startChat({ principal: h.owner, characterIds: h.characters.map((c) => c.id), opening: "none" });
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: other.chat.id, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  await h.root.services.chat.send({ principal: member, chatId: other.chat.id, content: "a different room's debt", timeZone: UTC_TIME_ZONE });
  const untouched = await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, other.chat.id));
  expect(untouched).toHaveLength(1);
  await h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId });
  expect(await debt(room)).toEqual([]);
  expect(await h.root.db.select().from(pendingTurns).where(eq(pendingTurns.chatId, other.chat.id))).toEqual(untouched);
  expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toHaveLength(1);
});

test("an admitted offline send finishes its actual enqueue before acceptance reads and settles the debt", async () => {
  await using ownership = new AsyncDisposableStack();
  const held = await freshHeldDb();
  ownership.defer(() => closeDb(held.db));
  const room = ownership.use(
    await speakerRoom({ chat: ["The raced enqueue is still answered by A."] }, { characters: [ARIA], group: LIST, server: { db: held.db } }),
  );
  const member = await invitePerson(room.h);
  const recipient = await nominee(room);
  const gate = held.hold(/^insert into "pending_turns"/u);
  const send = queued(room, member);
  const sent = Promise.allSettled([send]);
  let accepted: Promise<void> | undefined;
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  let complete = false;
  try {
    await gate.reached;
    expect(await debt(room)).toEqual([]);
    accepted = room.h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: room.h.chatId }).then(() => {
      complete = true;
    });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    expect(complete).toBe(false);
    await stillOutgoing(room, recipient);
    gate.release();
    await send;
    await accepted;
    expect(await debt(room)).toEqual([]);
    expect((await canon(room)).map((m) => m.role)).toEqual(["user", "assistant"]);
    await transferred(room, recipient);
  } finally {
    gate.release();
    await sent;
    await joined;
  }
});

test("admission owns an invoked turn before even its real membership query can finish", async () => {
  await using ownership = new AsyncDisposableStack();
  const held = await freshHeldDb();
  ownership.defer(() => closeDb(held.db));
  const room = ownership.use(
    await speakerRoom({ chat: ["The invocation still belongs to the outgoing host."] }, { characters: [ARIA], group: LIST, server: { db: held.db } }),
  );
  const { h } = room;
  const recipient = await nominee(room);
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual authorization-race room has no character");
  }
  const gate = held.hold(/from "chats" inner join "chat_participants"/u);
  const running = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  const settled = Promise.allSettled([running]);
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  try {
    await gate.reached;
    gate.disarm();
    const accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    await stillOutgoing(room, recipient);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
    gate.release();
    const result = await running;
    expect(result.aborted).toBe(false);
    expect(result.messages.map((m) => m.characterId)).toEqual([character.id]);
    await accepted;
    expect(room.peer.requests.filter((r) => r.method === "POST").map((r) => r.headers.get("authorization"))).toEqual([`Bearer ${B_HOST_KEY}`]);
    await transferred(room, recipient);
  } finally {
    gate.release();
    await settled;
    await joined;
  }
});

test("a claimed row held in real card preparation blocks handoff and refuses new turn admission before effects", async () => {
  await using ownership = new AsyncDisposableStack();
  const held = await freshHeldDb();
  ownership.defer(() => closeDb(held.db));
  const room = ownership.use(
    await speakerRoom({ chat: ["The already claimed round finishes as A."] }, { characters: [ARIA], group: LIST, server: { db: held.db } }),
  );
  const { h } = room;
  const member = await invitePerson(h);
  const recipient = await nominee(room);
  await queued(room, member);
  const gate = held.hold(/^select .* from "characters"/u);
  const drain = h.root.services.chat.drainDeferredTurns({ all: true });
  const drained = Promise.allSettled([drain]);
  let accepted: Promise<void> | undefined;
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  let complete = false;
  try {
    await gate.reached;
    gate.disarm();
    expect(await debt(room)).toEqual([]);
    expect(await speakerInputs(room.peer.requests, B_CHAT_MODEL)).toEqual([]);
    accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId }).then(() => {
      complete = true;
    });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    expect(complete).toBe(false);
    await stillOutgoing(room, recipient);
    const before = await canon(room);
    await expect(h.root.services.chat.send({ principal: member, chatId: h.chatId, content: "not admitted", timeZone: UTC_TIME_ZONE })).rejects.toMatchObject({
      code: CHAT_OP_CODES.locked,
    });
    expect(await canon(room)).toEqual(before);
    gate.release();
    await expect(drain).resolves.toEqual({ ran: 1, dropped: 0 });
    await accepted;
    expect((await canon(room)).filter((m) => m.role === "assistant")).toHaveLength(1);
    await transferred(room, recipient);
  } finally {
    gate.release();
    await drained;
    await joined;
  }
});

test("locked and lock-free turns stay concurrent while handoff closes only their room and Stop remains owner-only", async () => {
  await using room = await speakerRoom({ chat: ["The locked work ends.", "The lock-free work ends."], holdChat: true }, { characters: [ARIA], group: LIST });
  const { h } = room;
  const recipient = await nominee(room);
  const member = await invitePerson(h);
  const outsider = await h.root.principalFor((await h.root.actor()).id);
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the actual concurrent room has no character");
  }
  const locked = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: first.id });
  const lockedDone = Promise.allSettled([locked]);
  let generated: ReturnType<typeof h.root.services.chat.generate> | undefined;
  let generatedDone = Promise.resolve<PromiseSettledResult<Awaited<ReturnType<typeof h.root.services.chat.generate>>>[]>([]);
  let accepted: Promise<void> | undefined;
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  try {
    await room.peer.reached;
    generated = h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, timeZone: UTC_TIME_ZONE });
    generatedDone = Promise.allSettled([generated]);
    await expect.poll(async () => (await speakerInputs(room.peer.requests, B_CHAT_MODEL)).length).toBe(2);
    accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    await stillOutgoing(room, recipient);
    await expect(
      h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "blocked", timeZone: UTC_TIME_ZONE }),
    ).rejects.toMatchObject({ code: CHAT_OP_CODES.locked });
    await expect(h.root.services.chat.acceptHostHandoff({ principal: member, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notTurnOwner });
    await expect(h.root.services.chat.acceptHostHandoff({ principal: outsider, chatId: h.chatId })).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(
      h.root.services.chat.send({ principal: outsider, chatId: h.chatId, content: "no foreign busy oracle", timeZone: UTC_TIME_ZONE }),
    ).rejects.toBeInstanceOf(ChatNotFoundError);
    await expect(h.root.services.chat.abort({ principal: recipient, chatId: h.chatId })).rejects.toMatchObject({ code: CHAT_OP_CODES.notTurnOwner });
    const other = await h.root.services.chat.startChat({ principal: h.owner, characterIds: [first.id], opening: "none" });
    expect(
      (await h.root.services.chat.commitMessage({ principal: h.owner, chatId: other.chat.id, content: "another room is open", timeZone: UTC_TIME_ZONE }))
        .messages,
    ).toHaveLength(1);
    await h.root.services.chat.abort({ principal: h.owner, chatId: h.chatId });
    expect((await locked).aborted).toBe(true);
    expect((await generated).aborted).toBe(true);
    await accepted;
    expect(await canon(room)).toEqual([]);
    await transferred(room, recipient);
  } finally {
    room.peer.release();
    await lockedDone;
    await generatedDone;
    await joined;
  }
});

test("an early native lock-loss rejection cannot release handoff before the actual old body settles", async () => {
  await using ownership = new AsyncDisposableStack();
  const held = await freshHeldDb();
  ownership.defer(() => closeDb(held.db));
  const room = ownership.use(
    await speakerRoom(
      { chat: ["The physically completed old reply must not become stale canon."] },
      { characters: [ARIA], group: LIST, server: { db: held.db } },
    ),
  );
  const { h } = room;
  const recipient = await nominee(room);
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual lock-loss room has no character");
  }
  const gate = held.hold(/^select .* from "chat_locks"/u);
  const running = h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: character.id });
  const settled = Promise.allSettled([running]);
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  const replacement = "owned-handoff-replacement-holder";
  try {
    await gate.reached;
    gate.disarm();
    const lease = await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId)).get();
    if (lease === undefined) {
      throw new Error("the actual old body owns no lease at its commit check");
    }
    await h.root.db.update(chatLocks).set({ holder: replacement }).where(eq(chatLocks.chatId, h.chatId));
    h.root.timers.advance(Math.floor((lease.expiresAt - lease.acquiredAt) / 3));
    await expect(running).rejects.toMatchObject({ code: CHAT_OP_CODES.aborted });
    let complete = false;
    const accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId }).then(() => {
      complete = true;
    });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    expect(complete).toBe(false);
    await stillOutgoing(room, recipient);
    gate.release();
    await accepted;
    expect(await canon(room)).toEqual([]);
    await transferred(room, recipient);
    expect(await h.root.db.select().from(chatLocks).where(eq(chatLocks.chatId, h.chatId))).toMatchObject([{ holder: replacement }]);
  } finally {
    gate.release();
    await settled;
    await joined;
    await h.root.db.delete(chatLocks).where(and(eq(chatLocks.chatId, h.chatId), eq(chatLocks.holder, replacement)));
  }
});

test("a detached native SDK marker settles before the accepted copy and authority swap", async () => {
  const coveredRows = 4;
  await using fixture = await sdkEngineRoom({
    history: MANAGED_VERBATIM_TAIL + coveredRows,
    policy: { foreground: "reply", marker: "hold", inputTokens: 20_000 },
  });
  const { h } = fixture;
  const recipient = await invitePerson(h);
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: recipient.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  const foreground = await fixture.turn({ compaction: { mode: "managed", thresholdPct: 0.5 } });
  expect(foreground.aborted).toBe(false);
  await expect.poll(() => fixture.receipts.filter((r) => r.marker && r.held).length).toBe(1);
  let complete = false;
  const accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId }).then(() => {
    complete = true;
  });
  const joined = Promise.allSettled([accepted]);
  try {
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    expect(complete).toBe(false);
    expect(await h.root.db.select().from(characters).where(eq(characters.ownerId, recipient.userId))).toEqual([]);
    expect(await fixture.marker()).toMatchObject({ compactSummary: null });
    fixture.release();
    await accepted;
    expect((await fixture.marker())?.compactSummary).toBeTruthy();
    expect((await fixture.marker())?.compactedAtSeq).toBe(await fixture.seqOfRow(coveredRows));
    expect(
      await h.root.db
        .select()
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.role, "host"))),
    ).toMatchObject([{ userId: recipient.userId }]);
    expect(fixture.held.size).toBe(0);
  } finally {
    fixture.release();
    await joined;
  }
});

test("a completed public user commit retains its real RPG snapshot tail until handoff can transfer", async () => {
  await using ownership = new AsyncDisposableStack();
  const held = await freshHeldDb();
  ownership.defer(() => closeDb(held.db));
  const location = "The outgoing owner's registered observatory";
  const h = ownership.use(await turnRpgRoom([(): Response => turnRpgReply("The keeper reaches the observatory.", location)], { server: { db: held.db } }));
  const initial = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, timeZone: UTC_TIME_ZONE });
  expect(initial.aborted).toBe(false);
  await h.root.settleBackground();
  const assistant = initial.messages[0];
  if (assistant === undefined) {
    throw new Error("the real RPG generation left no selected assistant");
  }
  const before = await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.variantId, assistant.selectedVariantId)).get();
  if (before === undefined) {
    throw new Error("the real folded tool call left no snapshot to commit");
  }
  expect(before).toMatchObject({ messageId: assistant.id, variantId: assistant.selectedVariantId, location, committed: 0 });
  const recipient = await invitePerson(h);
  await h.root.services.chat.nominateHostHandoff({
    principal: h.owner,
    chatId: h.chatId,
    userId: recipient.userId,
    offer: { copyCharacters: true, copyGmPreset: false },
  });
  const gate = held.hold(/^update "rpg_snapshots" set "committed"/u);
  let joined = Promise.resolve<PromiseSettledResult<void>[]>([]);
  try {
    const committed = await h.root.services.chat.commitMessage({
      principal: h.owner,
      chatId: h.chatId,
      content: "Keep this exact observed state.",
      timeZone: UTC_TIME_ZONE,
    });
    expect(committed.messages.map((m) => m.role)).toEqual(["user"]);
    await gate.reached;
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, before.id)).get()).toMatchObject({ location, committed: 0 });
    let complete = false;
    const accepted = h.root.services.chat.acceptHostHandoff({ principal: recipient, chatId: h.chatId }).then(() => {
      complete = true;
    });
    joined = Promise.allSettled([accepted]);
    for (let turn = 0; turn < 10; turn += 1) {
      await physicalTurn();
    }
    expect(complete).toBe(false);
    expect(await h.root.db.select().from(characters).where(eq(characters.ownerId, recipient.userId))).toEqual([]);
    expect(
      await h.root.db
        .select()
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.role, "host"))),
    ).toMatchObject([{ userId: h.owner.userId }]);
    gate.release();
    await accepted;
    expect(await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, before.id)).get()).toMatchObject({
      messageId: assistant.id,
      variantId: assistant.selectedVariantId,
      location,
      committed: 1,
    });
    expect(
      await h.root.db
        .select()
        .from(chatParticipants)
        .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.role, "host"))),
    ).toMatchObject([{ userId: recipient.userId }]);
    expect((await h.root.services.rpg.getTrackerView({ principal: recipient, chatId: h.chatId })).ambient).toMatchObject({ location });
  } finally {
    gate.release();
    await joined;
    // The physical write must finish before this borrowed DB closes, including on an assertion failure.
    await expect.poll(async () => (await h.root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.id, before.id)).get())?.committed).toBe(1);
  }
});
