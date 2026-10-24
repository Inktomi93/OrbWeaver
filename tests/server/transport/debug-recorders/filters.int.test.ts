// @subject packages/server/src/transport/debug-recorders/rpg.ts

import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRpgTraceInspector } from "@orb/server/transport/debug-recorders";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { rpgTraceEventSchema } from "#contracts/rpg/trace.ts";

test("real RPG reads combine chat, raw turn and cap filters, excluding turn-less events without changing bytes or chronological stamps", async ({
  ids,
  clock,
}) => {
  const chatId = castId<ChatId>(ids.next("chat"));
  const otherChatId = castId<ChatId>(ids.next("chat"));
  const turnId = castId<ChatTurnId>(ids.next("chat_turn"));
  const otherTurnId = castId<ChatTurnId>(ids.next("chat_turn"));
  // The flight recorder a root composes with RPG tracing on, stamping from the root's clock.
  await using root = await createServerHarness({ rpgTrace: true, clock });
  const recorder = root.app.rpgTrace;
  if (recorder === undefined) {
    throw new Error("a root with RPG tracing on composed no flight recorder");
  }
  const events = [
    { phase: "mount", chatId, toolNames: ["update_scene"] },
    { phase: "flushed", chatId, turnId, outcome: "wrote", droppedReason: null },
    { phase: "flushed", chatId: otherChatId, turnId, outcome: "dropped", droppedReason: "other chat bytes" },
    { phase: "flushed", chatId, turnId: otherTurnId, outcome: "failed", droppedReason: null },
    { phase: "flushed", chatId, turnId, outcome: "no-writes", droppedReason: null },
  ];
  const startedAt = clock.now();
  for (const event of events) {
    recorder.sink(rpgTraceEventSchema.parse(event));
    clock.advance(1);
  }
  const inspector = createRpgTraceInspector(recorder);
  expect(inspector.recent({}).map((row) => row.seq)).toEqual([1, 2, 3, 4, 5]);
  expect(JSON.stringify(inspector.recent({}))).toContain("other chat bytes");
  const matching = inspector.recent({ chatId, turnId: String(turnId) });
  expect(matching).toEqual([
    { seq: 2, at: startedAt + 1, event: rpgTraceEventSchema.parse(events[1]) },
    { seq: 5, at: startedAt + 4, event: rpgTraceEventSchema.parse(events[4]) },
  ]);
  expect(JSON.stringify(matching)).not.toContain("other chat bytes");
  expect(inspector.recent({ chatId, turnId: String(turnId), limit: 1 })).toEqual([matching[1]]);
  expect(inspector.recent({ chatId }).map((row) => row.seq)).toEqual([1, 2, 4, 5]);
  expect(inspector.recent({ turnId: String(turnId) }).map((row) => row.seq)).toEqual([2, 3, 5]);
});
