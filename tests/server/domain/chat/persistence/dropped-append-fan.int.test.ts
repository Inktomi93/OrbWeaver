// Storage is the subject: a chat_events append refused on a live chat leaves no row and no seq gap, and the event
// still reaches an attached device without a cursor when it closes or invalidates live state (D342).
// @subject packages/server/src/domain/chat/bus.ts
// @subject packages/server/src/domain/chat/substrate/publication.ts
// @subject packages/server/src/transport/trpc/stream/sources/chat.ts

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatEvents } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import { refuseWrites } from "@orb/testkit/node/composed";
import type { Device, Frame, Room } from "../../../transport/trpc/stream/_held-room.ts";
import { openDevice, openRoom, typesOf } from "../../../transport/trpc/stream/_held-room.ts";

const DROPPED_LOG = "event dropped, its replay slot is permanently missing";
const REPLY = "The reply the log never announced.";

type DurableType = ChatBusEvent["type"];

/** Refuse every append of `type` on the room, as a database that keeps failing that write would. */
async function refuse(room: Room, type: DurableType): Promise<AsyncDisposable> {
  return await refuseWrites(room.root.db, { table: chatEvents, event: "INSERT", when: `NEW."type" = '${type}'`, message: `controlled ${type} refusal` });
}

/** A device on its own socket, attached and past its attach synthesis. */
async function watching(room: Room): Promise<Device> {
  const device = await openDevice(room, room.hostSeat);
  await device.attach();
  await device.waitFor((frames) => typesOf(frames).includes("chatOpened"));
  return device;
}

/** Commit a row and wait for it on `device`: every live frame published before it has arrived. */
async function barrier(room: Room, device: Device): Promise<void> {
  const { messages } = await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "the barrier row" });
  const barrierId = messages[0]?.id;
  await device.waitFor((frames) => frames.some(({ event }) => event.type === "messageCommitted" && event.messageId === barrierId));
}

async function durableLog(room: Room): Promise<readonly { readonly seq: number; readonly type: DurableType }[]> {
  const log = await room.root.services.chat.replayChatEvents({ principal: room.host, chatId: room.chatId });
  return log.map(({ seq, event }) => ({ seq, type: event.type }));
}

/** The seqs 1..n, the shape a log with no gap holds. */
function contiguous(log: readonly { readonly seq: number }[]): readonly number[] {
  return log.map((_, index) => index + 1);
}

function droppedLogLines(room: Room, type: DurableType): readonly string[] {
  return room.root.observability.logLines(200).filter((line) => line.includes(room.chatId) && line.includes(DROPPED_LOG) && line.includes(`"type":"${type}"`));
}

function framesOf(frames: readonly Frame[], type: DurableType): readonly Frame[] {
  return frames.filter(({ event }) => event.type === type);
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
      expect(droppedLogLines(room, terminal)).toHaveLength(1);
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

test("a dropped turnCompleted still fires the room's turnCompleted rule, because the turn completed", async () => {
  await using room = await openRoom();
  const rule = await room.root.services.automation.createRule({
    principal: room.host,
    timeZone: UTC_TIME_ZONE,
    chatId: room.chatId,
    name: "Mark the finished turn",
    trigger: { bus: "chat", type: "turnCompleted" },
    predicateCel: null,
    actions: [{ type: "set_variable", scope: "chat", key: "turn", op: "set", value: "finished" }],
  });
  await room.root.services.automation.setRuleEnabled({ principal: room.host, ruleId: rule.id, enabled: true });
  {
    await using _refusal = await refuse(room, "turnCompleted");
    await runTurnEndingIn(room, "turnCompleted");
  }
  await room.root.settleBackground();
  expect((await room.root.services.automation.listFires({ principal: room.host, ruleId: rule.id })).map(({ outcome }) => outcome)).toEqual(["fired"]);
  expect(await room.root.services.chat.getRuntimeVariables({ principal: room.host, chatId: room.chatId })).toMatchObject({ turn: "finished" });
});

test("a dropped canon announcement still reaches an attached device without a cursor", async () => {
  await using room = await openRoom();
  const { messages } = await room.root.services.chat.commitMessage({ principal: room.host, chatId: room.chatId, content: "The first line." });
  const line = messages[0];
  if (line === undefined) {
    throw new Error("the commit returned no message");
  }
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
    expect(droppedLogLines(room, "messageEdited")).toHaveLength(1);
  } finally {
    await device.close();
  }
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
    expect(droppedLogLines(room, "delta").length).toBeGreaterThan(0);
    const canon = await room.root.services.chat.listMessages({ principal: room.host, chatId: room.chatId });
    expect(canon.messages.map(({ content }) => content)).toContain(REPLY);
  } finally {
    await device.close();
  }
});
