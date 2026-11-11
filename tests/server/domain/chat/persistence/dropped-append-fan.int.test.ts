// Storage is the subject: a chat_events append refused on a live chat leaves no row and no seq gap, and the event
// still reaches attached devices and automation without a cursor unless DROPPED_APPEND_FANS rules otherwise (D342).
// @subject packages/server/src/domain/chat/bus.ts
// @subject packages/server/src/domain/chat/substrate/publication.ts
// @subject packages/server/src/transport/trpc/stream/sources/chat.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { createBookSchema, createEntrySchema, updateEntrySchema } from "@orb/contracts/world-info";
import { chatEvents } from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import { z } from "zod";
import type { Device, Frame, Room, Seat } from "../../../transport/trpc/stream/_held-room.ts";
import { admit, openDevice, openRoom, SECRET_HEAD, SECRET_TAIL, typesOf } from "../../../transport/trpc/stream/_held-room.ts";

const REPLY = "The reply the log never announced.";
const HIDDEN_LINE = `The narrator speaks. <lie character="Witness" truth="${SECRET_HEAD}${SECRET_TAIL}"/> The scene goes on.`;

type DurableType = ChatBusEvent["type"];

/** The fields of a log record this suite reads; the record's message text stays production's. */
const logRecordSchema = z.object({
  level: z.string(),
  chatId: typeIdSchema(ID_PREFIX.chat).optional(),
  type: z.string().optional(),
  attempts: z.number().optional(),
  seq: z.number().optional(),
});

/** Refuse every append of `type` on the room, as a database that keeps failing that write would. */
async function refuse(room: Room, type: DurableType): Promise<AsyncDisposable> {
  return await refuseWrites(room.root.db, { table: chatEvents, event: "INSERT", when: `NEW."type" = '${type}'`, message: `controlled ${type} refusal` });
}

/** A device on its own socket for `seat`, attached and past its attach synthesis. */
async function watching(room: Room, seat: Seat = room.hostSeat): Promise<Device> {
  const device = await openDevice(room, seat);
  await device.attach();
  await device.waitFor((frames) => typesOf(frames).includes("chatOpened"));
  return device;
}

async function commit(
  room: Room,
  content: string,
): Promise<NonNullable<Awaited<ReturnType<Room["root"]["services"]["chat"]["commitMessage"]>>["messages"][number]>> {
  const [line] = (await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content })).messages;
  if (line === undefined) {
    throw new Error("the commit returned no message");
  }
  return line;
}

/** Commit a row and wait for it on every device: every live frame published before it has arrived. */
async function barrier(room: Room, ...devices: readonly Device[]): Promise<void> {
  const { id } = await commit(room, "the barrier row");
  for (const device of devices) {
    await device.waitFor((frames) => frames.some(({ event }) => event.type === "messageCommitted" && event.messageId === id));
  }
}

async function durableLog(room: Room): Promise<readonly { readonly seq: number; readonly type: DurableType }[]> {
  const log = await room.root.services.chat.replayChatEvents({ principal: room.host, chatId: room.chatId });
  return log.map(({ seq, event }) => ({ seq, type: event.type }));
}

/** The seqs 1..n, the shape a log with no gap holds. */
function contiguous(log: readonly { readonly seq: number }[]): readonly number[] {
  return log.map((_, index) => index + 1);
}

/** The bus's terminal-drop records for `type`: error level, the spent attempts, and no proven seq (a recovered append has one). */
function terminalDrops(room: Room, type: DurableType): readonly z.infer<typeof logRecordSchema>[] {
  return room.root.observability
    .logLines(200)
    .map((line) => logRecordSchema.parse(JSON.parse(line)))
    .filter(
      (record) =>
        record.level === "error" && record.chatId === room.chatId && record.type === type && record.attempts !== undefined && record.seq === undefined,
    );
}

function framesOf(frames: readonly Frame[], type: DurableType): readonly Frame[] {
  return frames.filter(({ event }) => event.type === type);
}

function committedFrame(device: Device, messageId: string): Frame | undefined {
  return device.frames.find(({ event }) => event.type === "messageCommitted" && event.messageId === messageId);
}

function viewContent(frame: Frame | undefined): string | undefined {
  return frame?.event.type === "messageCommitted" ? frame.event.view?.content : undefined;
}

/** Run one turn that ends in `terminal`: a finished reply, or a host abort mid-stream. */
async function runTurnEndingIn(room: Room, terminal: "turnCompleted" | "turnAborted"): Promise<void> {
  if (terminal === "turnCompleted") {
    room.answerWith(REPLY);
    await room.send();
    return;
  }
  const turn = Promise.allSettled([room.send()]);
  await room.tokensLogged();
  await room.root.services.chat.abort({ principal: room.host, chatId: room.chatId });
  room.reply().fail();
  await turn;
}

/** Attach an always-on lore entry, so every turn in the room activates it. */
async function alwaysOnLore(room: Room): Promise<void> {
  const book = await room.root.services.worldInfo.createBook({ principal: room.host, input: createBookSchema.parse({ name: "The witness's constant scene" }) });
  const created = await room.root.services.worldInfo.createEntry({
    principal: room.host,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Witness", content: "The witness keeps an orbital ledger." }),
  });
  await room.root.services.worldInfo.updateEntry({
    principal: room.host,
    entryId: created.id,
    input: updateEntrySchema.parse({ metadata: { scopeMode: "always" } }),
  });
  await room.root.services.worldInfo.attachToChat({ principal: room.host, chatId: room.chatId, bookId: book.id });
}

test.for(["turnCompleted", "turnAborted"] as const)(
  "a dropped %s still closes the turn on an attached device, and a later attach opens no turn",
  async (terminal) => {
    await using room = await openRoom();
    const device = await watching(room);
    try {
      {
        await using _refusal = await refuse(room, terminal);
        await runTurnEndingIn(room, terminal);
        await barrier(room, device);
      }
      const accepted = framesOf(device.frames, "turnAccepted");
      const turnId = accepted[0]?.event.type === "turnAccepted" ? accepted[0].event.turnId : undefined;
      expect(accepted).toHaveLength(1);
      // The device's slot closes on the terminal it receives: the same turn, with no cursor.
      expect(framesOf(device.frames, terminal)).toEqual([{ chatId: room.chatId, seq: null, event: expect.objectContaining({ type: terminal, turnId }) }]);
      const log = await durableLog(room);
      expect(log.map(({ type }) => type)).toContain("turnAccepted");
      expect(log.map(({ type }) => type)).not.toContain(terminal);
      expect(log.map(({ seq }) => seq)).toEqual(contiguous(log));
      expect(terminalDrops(room, terminal)).toHaveLength(1);
      const late = await watching(room);
      try {
        expect(late.frames).toEqual([{ chatId: room.chatId, seq: log.at(-1)?.seq, event: { type: "chatOpened", chatId: room.chatId, openTurnIds: [] } }]);
      } finally {
        await late.close();
      }
    } finally {
      await device.close();
    }
  },
);

test("a dropped commit outside a turn reaches a from-join member stripped as its logged twin is, and the host whole", async () => {
  await using room = await openRoom();
  const seat = await admit(room, "dropped-commit-member");
  await room.root.services.chat.setMemberHistoryVisibility({ principal: room.host, chatId: room.chatId, userId: seat.id, visibility: "from-join" });
  const host = await watching(room);
  const member = await watching(room, seat);
  try {
    // The control: the same line, logged, through the sequenced path.
    const logged = await commit(room, HIDDEN_LINE);
    let dropped: Awaited<ReturnType<typeof commit>>;
    {
      await using _refusal = await refuse(room, "messageCommitted");
      dropped = await commit(room, HIDDEN_LINE);
    }
    await barrier(room, host, member);
    const memberLogged = committedFrame(member, logged.id);
    const memberDropped = committedFrame(member, dropped.id);
    expect(memberLogged?.seq).toEqual(expect.any(Number));
    expect(memberDropped?.seq).toBeNull();
    expect(viewContent(memberLogged)).not.toContain(SECRET_HEAD);
    expect(viewContent(memberDropped)).toBe(viewContent(memberLogged));
    const hostDropped = committedFrame(host, dropped.id);
    expect(hostDropped?.seq).toBeNull();
    expect(viewContent(hostDropped)).toBe(HIDDEN_LINE);
    expect(terminalDrops(room, "messageCommitted")).toHaveLength(1);
  } finally {
    await member.close();
    await host.close();
  }
});

test("a dropped canon announcement still reaches an attached device without a cursor", async () => {
  await using room = await openRoom();
  const line = await commit(room, "The first line.");
  const device = await watching(room);
  try {
    {
      await using _refusal = await refuse(room, "messageEdited");
      await room.root.services.chat.editMessage({ principal: room.host, chatId: room.chatId, messageId: line.id, content: "The edited line." });
      await barrier(room, device);
    }
    expect(framesOf(device.frames, "messageEdited")).toEqual([
      { chatId: room.chatId, seq: null, event: expect.objectContaining({ type: "messageEdited", messageId: line.id }) },
    ]);
    const log = await durableLog(room);
    expect(log.map(({ type }) => type)).toContain("messageCommitted");
    expect(log.map(({ type }) => type)).not.toContain("messageEdited");
    expect(terminalDrops(room, "messageEdited")).toHaveLength(1);
  } finally {
    await device.close();
  }
});

test.for(["warning", "turnStarted"] as const)("a dropped in-turn %s still reaches an attached device without a cursor", async (type) => {
  await using room = await openRoom();
  const device = await watching(room);
  try {
    {
      await using _refusal = await refuse(room, type);
      await runTurnEndingIn(room, "turnCompleted");
      await barrier(room, device);
    }
    const fanned = framesOf(device.frames, type);
    expect(fanned.length).toBeGreaterThan(0);
    expect(fanned.map(({ seq }) => seq)).toEqual(fanned.map(() => null));
    expect((await durableLog(room)).map(({ type: logged }) => logged)).not.toContain(type);
    expect(terminalDrops(room, type)).toHaveLength(fanned.length);
  } finally {
    await device.close();
  }
});

test.for([
  { trigger: "turnCompleted", prepare: async (): Promise<void> => undefined },
  { trigger: "turnStarted", prepare: async (): Promise<void> => undefined },
  { trigger: "worldInfoActivated", prepare: alwaysOnLore },
] as const)("a dropped $trigger still fires the room's $trigger rule", async ({ trigger, prepare }) => {
  await using room = await openRoom();
  await prepare(room);
  const rule = await room.root.services.automation.createRule({
    principal: room.host,
    timeZone: UTC_TIME_ZONE,
    chatId: room.chatId,
    name: "Mark the event",
    trigger: { bus: "chat", type: trigger },
    predicateCel: null,
    actions: [{ type: "set_variable", scope: "chat", key: "seen", op: "set", value: trigger }],
  });
  await room.root.services.automation.setRuleEnabled({ principal: room.host, ruleId: rule.id, enabled: true });
  {
    await using _refusal = await refuse(room, trigger);
    await runTurnEndingIn(room, "turnCompleted");
  }
  await room.root.settleBackground();
  expect(terminalDrops(room, trigger).length).toBeGreaterThan(0);
  expect((await room.root.services.automation.listFires({ principal: room.host, ruleId: rule.id })).map(({ outcome }) => outcome)).toEqual(["fired"]);
  expect(await room.root.services.chat.getRuntimeVariables({ principal: room.host, chatId: room.chatId })).toMatchObject({ seen: trigger });
});

test("a dropped delta is not fanned, and the turn's own terminal still converges the device on canon", async () => {
  await using room = await openRoom();
  const device = await watching(room);
  try {
    {
      await using _refusal = await refuse(room, "delta");
      await runTurnEndingIn(room, "turnCompleted");
      await barrier(room, device);
    }
    expect(framesOf(device.frames, "delta")).toEqual([]);
    const [completed] = framesOf(device.frames, "turnCompleted");
    expect(completed?.seq).toEqual(expect.any(Number));
    expect(framesOf(device.frames, "messageCommitted").map(({ event }) => (event.type === "messageCommitted" ? event.view?.content : undefined))).toContain(
      REPLY,
    );
    expect(terminalDrops(room, "delta").length).toBeGreaterThan(0);
    const canon = await room.root.services.chat.listMessages({ principal: room.host, chatId: room.chatId });
    expect(canon.messages.map(({ content }) => content)).toContain(REPLY);
  } finally {
    await device.close();
  }
});
