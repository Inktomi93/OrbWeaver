// @subject packages/server/src/domain/chat/engine/engine.ts
// Real native SDK final thinking and live deltas exercise both sides of the persisted-reasoning rule.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { coreSdkRoom } from "./core-sdk-fixture.ts";

const FINAL_THINKING = "The terminal assistant supplies the authoritative reasoning.";
const LIVE_THINKING = "The partial stream supplies its live reasoning.";
const THINKING_ROWS = [
  { label: "final only", thinking: FINAL_THINKING, deltaThinking: undefined, expected: FINAL_THINKING, live: [] },
  { label: "live deltas only", thinking: undefined, deltaThinking: LIVE_THINKING, expected: LIVE_THINKING, live: [LIVE_THINKING] },
  { label: "a final trace replacing live deltas", thinking: FINAL_THINKING, deltaThinking: LIVE_THINKING, expected: FINAL_THINKING, live: [LIVE_THINKING] },
] as const;

test.for(THINKING_ROWS)("native reasoning from $label persists on the actual unauthored assistant", async (row) => {
  await using fixture = await coreSdkRoom({
    text: "A reasoned native reply.",
    failed: false,
    cost: 0,
    thinking: row.thinking,
    deltaThinking: row.deltaThinking,
  });
  const { h } = fixture;
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ role: "assistant", authorUserId: null, content: "A reasoned native reply.", reasoning: row.expected }]);
  const committed = outcome.messages[0];
  if (committed === undefined) {
    throw new Error("the actual reasoning control committed no selected assistant");
  }
  expect((await readRoomCanon(h.root, h.owner, h.chatId)).find(({ id }) => id === committed.id)).toMatchObject({
    selectedVariantId: committed.selectedVariantId,
    reasoning: row.expected,
    role: "assistant",
    authorUserId: null,
  });
  expect(events.flatMap((event) => (event.type === "delta" && event.delta.kind === "reasoning" ? [event.delta.text] : []))).toEqual(row.live);
  const types = events.map((event) => event.type);
  expect(types).toContain("reasoningStreamDone");
  expect(types).toContain("turnCompleted");
  expect(types.indexOf("reasoningStreamDone")).toBeLessThan(types.indexOf("turnCompleted"));
  await fixture[Symbol.asyncDispose]();
  const physical = fixture.childCounts();
  expect(physical.spawned).toBeGreaterThan(0);
  expect(physical.closed).toBe(physical.spawned);
});
