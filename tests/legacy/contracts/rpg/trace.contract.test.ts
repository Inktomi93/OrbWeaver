// @orb/contracts/rpg/trace — the flight-recorder record `/api/_debug/rpg/traces` serialises.

import {
  RPG_BUS_EVENT_TYPES,
  RPG_DELIVERY_PATHS,
  RPG_FLUSH_OUTCOMES,
  RPG_FOLD_FALLBACK_REASONS,
  RPG_TOOL_CALL_VERDICTS,
  rpgTraceEventSchema,
  rpgTraceRecordSchema,
} from "@orb/contracts/rpg";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const CHAT_ID = mintTypeId(ID_PREFIX.chat);
const TURN_ID = mintTypeId(ID_PREFIX.chatTurn);

const FLUSHED = { phase: "flushed", chatId: CHAT_ID, turnId: TURN_ID, outcome: "wrote", droppedReason: null } as const;

test("every phase parses with its own fields", () => {
  const events = [
    { phase: "mount", chatId: CHAT_ID, toolNames: ["update_scene"] },
    {
      phase: "tool",
      chatId: CHAT_ID,
      turnId: TURN_ID,
      calls: [{ name: "update_scene", args: "{}", verdict: "applied", issues: [] }],
      vehicle: "folded extraction",
    },
    { phase: "flush", chatId: CHAT_ID, turnId: TURN_ID, path: "folded", fallbackReason: null },
    FLUSHED,
    { phase: "bus", chatId: CHAT_ID, type: "gameChanged" },
  ];
  for (const event of events) {
    expect(rpgTraceEventSchema.safeParse(event).success, event.phase).toBe(true);
  }
});

test("a settle event accepts every flush outcome and refuses one the tuple does not name", () => {
  for (const outcome of RPG_FLUSH_OUTCOMES) {
    expect(rpgTraceEventSchema.safeParse({ ...FLUSHED, outcome }).success, outcome).toBe(true);
  }
  expect(rpgTraceEventSchema.safeParse({ ...FLUSHED, outcome: "settled" }).success).toBe(false);
});

test("a turn-scoped phase without its turn id, an unknown phase and a stray key are refused", () => {
  const { turnId: _turnId, ...withoutTurn } = FLUSHED;
  expect(rpgTraceEventSchema.safeParse(withoutTurn).success).toBe(false);
  expect(rpgTraceEventSchema.safeParse({ ...FLUSHED, phase: "settled" }).success).toBe(false);
  expect(rpgTraceEventSchema.safeParse({ ...FLUSHED, extra: 1 }).success).toBe(false);
});

test("a flush receipt and a bus event are checked against their homed vocabularies", () => {
  const flush = { phase: "flush", chatId: CHAT_ID, turnId: TURN_ID, path: RPG_DELIVERY_PATHS[0], fallbackReason: null };
  expect(rpgTraceEventSchema.safeParse(flush).success).toBe(true);
  expect(rpgTraceEventSchema.safeParse({ ...flush, path: "teleport" }).success).toBe(false);
  expect(rpgTraceEventSchema.safeParse({ phase: "bus", chatId: CHAT_ID, type: RPG_BUS_EVENT_TYPES[0] }).success).toBe(true);
  expect(rpgTraceEventSchema.safeParse({ phase: "bus", chatId: CHAT_ID, type: "nope" }).success).toBe(false);
  for (const fallbackReason of RPG_FOLD_FALLBACK_REASONS) {
    expect(rpgTraceEventSchema.safeParse({ ...flush, fallbackReason }).success, fallbackReason).toBe(true);
  }
  expect(rpgTraceEventSchema.safeParse({ ...flush, fallbackReason: "nope" }).success).toBe(false);
});

test("a chat id is a typed chat id, not any string or another kind's id", () => {
  expect(rpgTraceEventSchema.safeParse({ ...FLUSHED, chatId: TURN_ID }).success).toBe(false);
  expect(rpgTraceEventSchema.safeParse({ ...FLUSHED, chatId: "chat" }).success).toBe(false);
});

test("a recorded tool call keeps its raw args and refuses a verdict outside the tuple", () => {
  const tool = (verdict: string): unknown => ({
    phase: "tool",
    chatId: CHAT_ID,
    turnId: TURN_ID,
    calls: [{ name: "update_scene", args: '{"weather":', verdict, issues: ["weather"] }],
    vehicle: "tool round",
  });
  for (const verdict of RPG_TOOL_CALL_VERDICTS) {
    expect(rpgTraceEventSchema.safeParse(tool(verdict)).success, verdict).toBe(true);
  }
  expect(rpgTraceEventSchema.safeParse(tool("ignored")).success).toBe(false);
});

test("a record stamps the sequence and time around the event", () => {
  expect(rpgTraceRecordSchema.safeParse({ seq: 3, at: 1_790_000_000_000, event: FLUSHED }).success).toBe(true);
  expect(rpgTraceRecordSchema.safeParse({ seq: 1.5, at: 1, event: FLUSHED }).success).toBe(false);
  expect(rpgTraceRecordSchema.safeParse({ seq: 1, at: 1 }).success).toBe(false);
});
