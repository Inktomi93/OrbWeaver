// @subject packages/server/src/transport/trpc/routers/chat.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts
// @subject packages/server/src/domain/chat/persistence/retained-canon.ts
// A re-voice lands only on a present seat of the room. Every refused stamp leaves the row, the bus and the rollups alone.

import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatBusEvent } from "@orb/contracts/chat";
import { REATTRIBUTE_MESSAGES_MAX, TURN_ABORTED_OP_CODE } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { closeDb } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, MessageId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { signInWithPassword } from "@orb/testkit/node/auth";
import type { ChatRoot, ServerTestHarness } from "@orb/testkit/node/composed";
import { createChatRoot, freshHeldDb, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";
import { z } from "zod";
import { textProvider, textRoom, wireBodies, wireText } from "../../../domain/chat/scenario-physical.ts";

const LOCAL_ENV = { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "deny" };
const ADA = createCharacterSchema.parse({ handle: "reattr-ada", name: "Ada Vane", description: "The first voice." });
const BEX = createCharacterSchema.parse({ handle: "reattr-bex", name: "Bex Orrin", description: "The second voice." });
const FOREIGN_NAME = "Quill the Private";
const FIRST_REPLY = "the first reply stays with ada";
const SECOND_REPLY = "the second reply moves between voices";
const TRANSCRIPT = [
  { role: "user", content: "the opening line" },
  { role: "assistant", speakerHandle: ADA.handle, content: FIRST_REPLY },
  { role: "user", content: "the middle line" },
  { role: "assistant", speakerHandle: ADA.handle, content: SECOND_REPLY },
] as const;

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type RoomOptions = NonNullable<Parameters<typeof textRoom>[1]>;

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly ada: CharacterId;
  readonly bex: CharacterId;
  readonly userLine: MessageId;
  readonly firstReply: MessageId;
  readonly secondReply: MessageId;
}

async function roomOver(h: ChatRoot): Promise<Room> {
  const [ada, bex] = h.characters;
  const rows = (await h.caller.chat.listMessages({ chatId: h.chatId })).messages.toSorted((a, b) => a.seq - b.seq);
  const [userLine, firstReply, , secondReply] = rows;
  if (ada === undefined || bex === undefined || userLine === undefined || firstReply === undefined || secondReply === undefined) {
    throw new Error("the imported room lost its seated cast or its canon");
  }
  return {
    h,
    ada: ada.id,
    bex: bex.id,
    userLine: userLine.id,
    firstReply: firstReply.id,
    secondReply: secondReply.id,
    [Symbol.asyncDispose]: () => h[Symbol.asyncDispose](),
  };
}

async function room(options: RoomOptions = {}): Promise<Room> {
  return await roomOver(await textRoom(["the next reply"], { characters: [ADA, BEX], transcript: TRANSCRIPT, ...options }));
}

async function stampOf(h: ChatRoot, messageId: MessageId, chatId: ChatId = h.chatId): Promise<CharacterId | null | undefined> {
  return (await h.caller.chat.listMessages({ chatId })).messages.find((row) => row.id === messageId)?.characterId;
}

/** One voice's rollup through the production read, without the fields a write stamps with its own clock. */
async function voiceRollup(h: ChatRoot, characterId: CharacterId): Promise<unknown> {
  const view = await h.root.services.stats.character(h.owner.userId, characterId);
  if (view === null) {
    return null;
  }
  const { computedAt: _computedAt, lastActivityAt: _lastActivityAt, ...counters } = view;
  return counters;
}

/** Joins the corpus's second human as a plain member. */
async function memberOf(h: ChatRoot): Promise<Caller> {
  const secondUserId = await h.root.app.sessions.ensureUser(castId<Handle>("reattr-member"));
  const member = await h.root.principalFor(secondUserId);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  return await h.root.internalCallerFor(secondUserId);
}

async function strangerOf(h: ChatRoot, handle: string): Promise<{ readonly caller: Caller; readonly characterId: CharacterId }> {
  const account = await h.root.actor({ handle: castId<Handle>(handle) });
  const caller = await h.root.internalCallerFor(account.id);
  const card = await caller.character.create({ input: createCharacterSchema.parse({ handle: `${handle}-card`, name: FOREIGN_NAME, description: "Private." }) });
  // A real seat in the stranger's own room: the gate must key on this room's roster, not on "seated somewhere".
  await caller.chat.startChat({ characterIds: [card.id], opening: "none" });
  return { caller, characterId: card.id };
}

async function refusalOf(attempt: Promise<unknown>): Promise<{ readonly code: unknown; readonly message: string }> {
  const outcome = await attempt.then(
    () => null,
    (error: unknown) => error,
  );
  if (!(outcome instanceof Error)) {
    throw new Error("the stamp was not refused");
  }
  return { code: "code" in outcome ? outcome.code : undefined, message: outcome.message };
}

/** Records the room's bus events through the production live channel while `run` runs. */
async function eventsDuring(h: ChatRoot, run: () => Promise<unknown>): Promise<ChatBusEvent[]> {
  const events: ChatBusEvent[] = [];
  const stop = h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
    if (event.chatId === h.chatId) {
      events.push(event);
    }
  });
  try {
    await run();
    await h.root.settleBackground();
  } finally {
    stop();
  }
  return events;
}

test("a member and a stranger are refused and the stamp does not move", async () => {
  await using seeded = await room();
  const { h, firstReply, ada, bex } = seeded;
  const member = await memberOf(h);
  const stranger = await strangerOf(h, "reattr-stranger");
  const input = { chatId: h.chatId, messageIds: [firstReply], characterId: bex };

  await expect(member.chat.reattributeMessages(input)).toThrowTRPCError("BAD_REQUEST");
  await expect(stranger.caller.chat.reattributeMessages(input)).toThrowTRPCError("NOT_FOUND");

  expect(await stampOf(h, firstReply)).toBe(ada);
});

test("a stranger's character and a nonexistent id get one refusal, and no foreign identity reaches the room", async () => {
  await using seeded = await room();
  const { h, firstReply, ada } = seeded;
  const { characterId: foreign } = await strangerOf(h, "reattr-tenant");
  const nonexistent = mintTypeId(ID_PREFIX.character);
  const input = { chatId: h.chatId, messageIds: [firstReply] };

  const events = await eventsDuring(h, async () => {
    const stranger = await refusalOf(h.caller.chat.reattributeMessages({ ...input, characterId: foreign }));
    const missing = await refusalOf(h.caller.chat.reattributeMessages({ ...input, characterId: nonexistent }));
    expect(stranger.code).toBe("NOT_FOUND");
    expect(stranger).toEqual(missing);
  });

  expect(events).toEqual([]);
  expect(await stampOf(h, firstReply)).toBe(ada);
  const detail = await h.caller.chat.getChat({ chatId: h.chatId });
  expect(JSON.stringify(detail)).not.toContain(FOREIGN_NAME);
  expect(JSON.stringify((await h.caller.chat.listMessages({ chatId: h.chatId })).messages)).not.toContain(foreign);
});

test("a deleted character is refused like a stranger's, because its seat went with it", async () => {
  await using seeded = await room();
  const { h, firstReply, ada, bex } = seeded;
  await h.caller.character.remove({ characterId: bex });
  const deleted = await refusalOf(h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: bex }));
  const missing = await refusalOf(
    h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: mintTypeId(ID_PREFIX.character) }),
  );
  expect(deleted.code).toBe("NOT_FOUND");
  expect(deleted).toEqual(missing);
  expect(await stampOf(h, firstReply)).toBe(ada);
});

test("the wire refuses a persona id, an unknown key, an empty list and an over-long list before the verb", async () => {
  await using seeded = await room();
  const { h, firstReply, ada, bex } = seeded;
  const persona = mintTypeId(ID_PREFIX.persona);
  const input = { chatId: h.chatId, messageIds: [firstReply], characterId: bex };
  await expect(h.caller.chat.reattributeMessages({ ...input, characterId: castId<CharacterId>(persona) })).toThrowTRPCError("BAD_REQUEST");
  await expect(h.caller.chat.reattributeMessages({ ...input, personaId: persona } as typeof input)).toThrowTRPCError("BAD_REQUEST");
  await expect(h.caller.chat.reattributeMessages({ ...input, messageIds: [] })).toThrowTRPCError("BAD_REQUEST");
  const overLong = Array.from({ length: REATTRIBUTE_MESSAGES_MAX + 1 }, () => firstReply);
  await expect(h.caller.chat.reattributeMessages({ ...input, messageIds: overLong })).toThrowTRPCError("BAD_REQUEST");
  expect(await stampOf(h, firstReply)).toBe(ada);
});

test("an id from another chat refuses the whole set, in neither room does a row move", async () => {
  await using seeded = await room();
  const { h, firstReply, secondReply, ada, bex } = seeded;
  const other = await h.caller.chat.forkChat({ chatId: h.chatId });
  const otherRows = (await h.caller.chat.listMessages({ chatId: other.chat.id })).messages.filter((row) => row.role === "assistant");
  const otherReply = otherRows[0];
  if (otherReply === undefined) {
    throw new Error("the fork copied no reply");
  }

  await expect(h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply, otherReply.id], characterId: bex })).toThrowTRPCError(
    "NOT_FOUND",
  );

  expect(await stampOf(h, firstReply)).toBe(ada);
  expect(await stampOf(h, otherReply.id, other.chat.id)).toBe(ada);
  expect(await stampOf(h, secondReply)).toBe(ada);
});

test("a row with no character voice to replace is refused by code, never by the attribution constraint", async () => {
  await using h = await textRoom(["unused"], {
    characters: [ADA, BEX],
    transcript: [
      { role: "user", content: "a human line" },
      { role: "assistant", kind: "narrator", content: "the group narrates" },
      { role: "assistant", kind: "comment", speakerHandle: ADA.handle, content: "an out-of-band aside" },
      { role: "assistant", speakerHandle: ADA.handle, content: FIRST_REPLY },
    ],
  });
  const [ada, bex] = h.characters;
  if (ada === undefined || bex === undefined) {
    throw new Error("the imported room lost its cast");
  }
  const rows = (await h.caller.chat.listMessages({ chatId: h.chatId })).messages;
  const fine = rows.find((row) => row.content === FIRST_REPLY);
  if (fine === undefined) {
    throw new Error("the imported room lost its reply");
  }
  for (const row of rows.filter((candidate) => candidate.id !== fine.id)) {
    await expect(h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [fine.id, row.id], characterId: bex.id })).toThrowTRPCError("BAD_REQUEST");
    expect(await stampOf(h, row.id)).toBe(row.characterId);
  }
  expect(await stampOf(h, fine.id)).toBe(ada.id);
});

test("a removed seat is no target until it is re-added, and a row can still leave a removed voice", async () => {
  await using seeded = await room();
  const { h, firstReply, secondReply, ada, bex } = seeded;
  await h.caller.chat.removeCharacterFromChat({ chatId: h.chatId, characterId: bex });

  const removed = await refusalOf(h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: bex }));
  const missing = await refusalOf(
    h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: mintTypeId(ID_PREFIX.character) }),
  );
  expect(removed.code).toBe("NOT_FOUND");
  expect(removed).toEqual(missing);
  expect(await stampOf(h, firstReply)).toBe(ada);

  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: bex });
  await h.caller.chat.removeCharacterFromChat({ chatId: h.chatId, characterId: ada });
  await h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [secondReply], characterId: bex });
  expect(await stampOf(h, secondReply)).toBe(bex);
});

test("a seat removed between the gate and the write loses the race: no stamp, no event, and the retry names the seat", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const h = ownership.use(
    await createChatRoot({
      memoryEnabled: false,
      providerFetch: textProvider([]),
      server: { db: held.db },
      characters: [ADA, BEX],
      transcript: TRANSCRIPT,
    }),
  );
  const { firstReply, ada, bex } = await roomOver(h);
  // A seat elsewhere must not satisfy the write's fence once this room's seat is gone.
  await h.caller.chat.startChat({ characterIds: [bex], opening: "none" });
  const rollups = await Promise.all([voiceRollup(h, ada), voiceRollup(h, bex)]);
  const events = await eventsDuring(h, async () => {
    const gate = held.hold(/^insert into "chats"/u);
    const attempt = h.root.services.chat.reattributeMessages({ principal: h.owner, chatId: h.chatId, messageIds: [firstReply], characterId: bex }).then(
      () => "committed",
      (error: Error) => {
        if (error instanceof DomainOperationError) {
          return error.code;
        }
        throw error;
      },
    );
    await gate.reached;
    gate.disarm();
    await h.caller.chat.removeCharacterFromChat({ chatId: h.chatId, characterId: bex });
    gate.release();
    expect(await attempt).toBe(TURN_ABORTED_OP_CODE);
  });
  expect(events.filter((event) => event.type === "messageEdited")).toEqual([]);
  expect(await stampOf(h, firstReply)).toBe(ada);
  expect(await Promise.all([voiceRollup(h, ada), voiceRollup(h, bex)])).toEqual(rollups);
  await expect(h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: bex })).toThrowTRPCError("NOT_FOUND");
});

test("the bus and the durable log carry the new voice, once per distinct row", async () => {
  await using seeded = await room();
  const { h, secondReply, bex } = seeded;
  const events = await eventsDuring(h, () => h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [secondReply, secondReply], characterId: bex }));
  const edits = events.filter((event) => event.type === "messageEdited");
  expect(edits).toMatchObject([{ messageId: secondReply, view: { characterId: bex } }]);
  const durable = await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId });
  expect(durable.map(({ event }) => event).filter((event) => event.type === "messageEdited")).toMatchObject([
    { messageId: secondReply, view: { characterId: bex } },
  ]);
  expect((await h.caller.chat.listMessages({ chatId: h.chatId })).messages.find((row) => row.id === secondReply)?.characterId).toBe(bex);
});

test("stamping a row with the voice it already has writes and emits nothing", async () => {
  await using seeded = await room();
  const { h, firstReply, ada } = seeded;
  const events = await eventsDuring(h, () => h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: ada }));
  expect(events).toEqual([]);
});

test("a re-voice of a row under a member's floor reaches the host and never the floored member, live or replayed", async () => {
  await using h = await textRoom(["unused"], { characters: [ADA, BEX], transcript: TRANSCRIPT, server: { env: LOCAL_ENV, secretBoxKey: SECRET_BOX_TEST_KEY } });
  const { firstReply, secondReply, bex } = await roomOver(h);
  const handle = castId<Handle>("reattr-floored");
  const password = "a-real-floored-password-through-production-login";
  const user = await h.caller.admin.createUser({ handle, password });
  await h.caller.settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-human capability binds when a caller is built, so these follow the setting.
  const owner = await h.root.internalCallerFor(h.root.ownerId);
  const member = await h.root.internalCallerFor(user.id);
  const invitation = await owner.invites.createInvite({ chatId: h.chatId, input: {} });
  const joined = await member.invites.redeemInvite({ token: invitation.token });
  const seqs = new Map((await owner.chat.listMessages({ chatId: h.chatId })).messages.map((row) => [row.id, row.seq]));
  expect(seqs.get(firstReply)).toBeLessThan(joined.participant.joinSeq);
  expect(seqs.get(secondReply)).toBe(joined.participant.joinSeq);
  await owner.invites.setMemberHistoryVisibility({ chatId: h.chatId, userId: user.id, visibility: "from-join" });

  const cookie = await signInWithPassword(h.root, handle, password);
  const { socketId } = streamConnectInputSchema.parse({ socketId: h.root.ids.uuid() });
  const address = new URL("http://localhost/api/trpc/stream.connect");
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stop = new AbortController();
  const response = await h.root.http.request(address, { headers: { cookie, accept: "text/event-stream" }, signal: stop.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the authenticated subscription omitted its stream");
  }
  const decoder = new TextDecoder();
  let bytes = "";
  const readThrough = async (needle: string): Promise<void> => {
    while (!bytes.includes(needle)) {
      const next = await reader.read();
      if (next.done) {
        throw new Error("the subscription ended before its delivery barrier");
      }
      bytes += decoder.decode(next.value, { stream: true });
    }
  };
  try {
    await member.stream.attach({ socketId, ref: { channel: "chat", chatId: h.chatId }, sinceSeq: 0 });
    await owner.chat.reattributeMessages({ chatId: h.chatId, messageIds: [firstReply], characterId: bex });
    // The visible row's edit is the delivery barrier: the floored row's edit published before it.
    await owner.chat.reattributeMessages({ chatId: h.chatId, messageIds: [secondReply], characterId: bex });
    await readThrough(`"messageId":"${secondReply}"`);
    expect(bytes).not.toContain(firstReply);
    expect(bytes).not.toContain(FIRST_REPLY);

    const replay = await h.root.services.chat.replayChatEvents({ principal: await h.root.principalFor(user.id), chatId: h.chatId });
    const edited = replay.map(({ event }) => event).filter((event) => event.type === "messageEdited");
    expect(edited).toMatchObject([{ messageId: secondReply, view: { characterId: bex } }]);

    const hostReplay = await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId });
    expect(hostReplay.map(({ event }) => event).filter((event) => event.type === "messageEdited")).toHaveLength(2);
    expect((await member.chat.listMessages({ chatId: h.chatId })).messages.map((row) => row.id)).not.toContain(firstReply);
  } finally {
    stop.abort();
    await Promise.allSettled([reader.cancel()]);
    reader.releaseLock();
  }
});

test("the next prompt labels the row with its new speaker", async () => {
  await using seeded = await room({ group: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const { h, secondReply, ada, bex } = seeded;
  await h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [secondReply], characterId: bex });
  const turn = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: ada });
  expect(turn.aborted).toBe(false);
  const wire = wireText((await wireBodies(h)).at(-1) ?? null);
  expect(wire).toContain(`${BEX.name}: ${SECOND_REPLY}`);
  expect(wire).not.toContain(`${ADA.name}: ${SECOND_REPLY}`);
});

test("the export names the new speaker", async () => {
  await using seeded = await room();
  const { h, secondReply, bex } = seeded;
  await h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [secondReply], characterId: bex });
  const exported = await h.root.app.exportService.exportChat({ principal: h.owner, chatId: h.chatId, format: "jsonl" });
  const speakers = new Map(
    (exported?.text ?? "")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => z.object({ mes: z.string().optional(), name: z.string().optional() }).parse(JSON.parse(line)))
      .map((line) => [line.mes, line.name]),
  );
  expect(speakers.get(SECOND_REPLY)).toBe(BEX.name);
  expect(speakers.get(FIRST_REPLY)).toBe(ADA.name);
});

test("the per-character rollups follow the stamp and agree with a rebuild", async () => {
  await using seeded = await room();
  const { h, secondReply, bex, ada } = seeded;
  await h.root.services.stats.reconcile(h.owner.userId);
  await h.caller.chat.reattributeMessages({ chatId: h.chatId, messageIds: [secondReply, secondReply], characterId: bex });
  const live = await Promise.all([voiceRollup(h, ada), voiceRollup(h, bex)]);
  expect(live).toMatchObject([{ assistantTurns: 1 }, { assistantTurns: 1 }]);
  await h.root.services.stats.reconcile(h.owner.userId);
  expect(await Promise.all([voiceRollup(h, ada), voiceRollup(h, bex)])).toEqual(live);
});
