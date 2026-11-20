// Two turns of one game whose state rounds overlap keep both turns' writes, in either release order, and a
// write the later beat replaced is recorded on the losing turn's tool-call row. A regen of an older message stays
// silently superseded. Production entry: `chat.send`, `chat.generate` and `chat.swipe` on the composed root,
// whose post-commit flush writes through `commitTurnWrite`; read back through `rpg.getTrackerView` and
// `rpg.listTurnToolCalls`. Layer: server integration (ordering, persistence and the per-game section).
// @subject packages/server/src/domain/rpg/snapshot-edit.ts
// @subject packages/server/src/domain/rpg/chat-ops/flush.ts
// @subject packages/server/src/domain/rpg/persistence/snapshots.ts

import type { RpgTurnToolCallsView } from "@orb/contracts/rpg";
import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { cheapRoundRoom, held, narrative, QUEST_TOOL, round, SCENE_TOOL, settledRounds } from "./round-room.ts";

// The earlier beat's round (a lock-free generate committed first) and the later beat's round (the send).
const EARLIER_ROUND = round([
  { name: SCENE_TOOL, args: { location: "The bridge" } },
  { name: QUEST_TOOL, args: { name: "Guard the bridge", action: "create" } },
]);
const LATER_ROUND = round([
  { name: SCENE_TOOL, args: { location: "The north gate" } },
  { name: QUEST_TOOL, args: { name: "Find the smith", action: "create" } },
]);

async function viewOf(h: ChatRoot): Promise<{ readonly location: string | undefined; readonly quests: readonly string[] }> {
  const view = await h.root.services.rpg.getTrackerView({ principal: h.owner, chatId: h.chatId });
  return { location: view.ambient?.location, quests: view.quests.map((quest) => quest.name).toSorted() };
}

async function recordOf(h: ChatRoot, variantId: RpgTurnToolCallsView["variantId"]): Promise<RpgTurnToolCallsView> {
  const record = (await h.root.services.rpg.listTurnToolCalls({ principal: h.owner, chatId: h.chatId })).find((row) => row.variantId === variantId);
  if (record === undefined) {
    throw new Error("the turn recorded no tool calls");
  }
  return record;
}

type TurnMessage = Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["send"]>>["messages"][number];

function assistantOf(outcome: { readonly messages: readonly TurnMessage[] }): TurnMessage {
  const assistant = outcome.messages.find((message) => message.role === "assistant");
  if (assistant === undefined) {
    throw new Error("the turn committed no assistant slot");
  }
  return assistant;
}

test("a later beat's row that lands first keeps the earlier turn's writes under it, and the replaced write is on the earlier turn's record", async () => {
  const laterNarrative = held(narrative("Aria sets out for the north gate."));
  const earlierRound = held(EARLIER_ROUND);
  using plan = finiteReplies("later lands first", [laterNarrative.respond, narrative("Aria lingers by the bridge."), earlierRound.respond, LATER_ROUND]);
  await using h = await cheapRoundRoom(plan.take);
  const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Head north." });
  await laterNarrative.reached;
  const earlier = assistantOf(await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId }));
  await earlierRound.reached;
  laterNarrative.release();
  const later = assistantOf(await sending);
  await expect.poll(() => settledRounds(h)).toBe(1);
  earlierRound.release();
  await h.root.settleBackground();

  // The generate committed first, so its slot is the earlier beat and its round is the one that landed last.
  expect(earlier.seq).toBeLessThan(later.seq);
  expect(await viewOf(h)).toEqual({ location: "The north gate", quests: ["Find the smith", "Guard the bridge"] });
  const lost = await recordOf(h, earlier.selectedVariantId);
  expect(lost.calls.map((call) => call.verdict)).toEqual(["overridden", "overridden"]);
  expect(lost.calls[0]?.issues.some((issue) => issue.includes("location"))).toBe(true);
  // Positive control: the later beat's own record claims nothing it did not lose.
  expect((await recordOf(h, later.selectedVariantId)).calls.map((call) => call.verdict)).toEqual(["applied", "applied"]);
});

test("an earlier beat's row that lands while a later round runs stays under the later turn's row", async () => {
  const laterNarrative = held(narrative("Aria sets out for the north gate."));
  const earlierRound = held(EARLIER_ROUND);
  const laterRound = held(LATER_ROUND);
  using plan = finiteReplies("earlier lands first", [
    laterNarrative.respond,
    narrative("Aria lingers by the bridge."),
    earlierRound.respond,
    laterRound.respond,
  ]);
  await using h = await cheapRoundRoom(plan.take);
  const sending = h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Head north." });
  await laterNarrative.reached;
  const earlier = assistantOf(await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId }));
  await earlierRound.reached;
  laterNarrative.release();
  const later = assistantOf(await sending);
  // Both rounds are in flight: the later turn read its base before the earlier row existed.
  await laterRound.reached;
  earlierRound.release();
  await expect.poll(() => settledRounds(h)).toBe(1);
  laterRound.release();
  await h.root.settleBackground();

  expect(earlier.seq).toBeLessThan(later.seq);
  expect(await viewOf(h)).toEqual({ location: "The north gate", quests: ["Find the smith", "Guard the bridge"] });
  // In this order nothing was lost: the later beat wrote over the earlier one exactly as it would in sequence.
  expect((await recordOf(h, earlier.selectedVariantId)).calls.map((call) => call.verdict)).toEqual(["applied", "applied"]);
  expect((await recordOf(h, later.selectedVariantId)).calls.map((call) => call.verdict)).toEqual(["applied", "applied"]);
});

test("a regen of an older message is superseded by the beats after it, silently", async () => {
  using plan = finiteReplies("regen of an older message", [
    narrative("Aria reaches the bridge."),
    EARLIER_ROUND,
    narrative("Aria reaches the north gate."),
    LATER_ROUND,
    narrative("Aria reaches the old mill instead."),
    round([
      { name: SCENE_TOOL, args: { location: "The old mill" } },
      { name: QUEST_TOOL, args: { name: "Grind the grain", action: "create" } },
    ]),
  ]);
  await using h = await cheapRoundRoom(plan.take);
  const first = assistantOf(await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Head for the bridge." }));
  await h.root.settleBackground();
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Head north." });
  await h.root.settleBackground();
  // The swipe's variant is minted after the later slot exists, as in real play.
  h.root.clock.advance(1000);
  const swiped = assistantOf(await h.root.services.chat.swipe({ principal: h.owner, chatId: h.chatId, messageId: first.id }));
  await h.root.settleBackground();

  expect(swiped.id).toBe(first.id);
  expect(await viewOf(h)).toEqual({ location: "The north gate", quests: ["Find the smith", "Guard the bridge"] });
  const regen = await recordOf(h, swiped.selectedVariantId);
  expect(regen.calls.map((call) => call.verdict)).toEqual(["applied", "applied"]);
  expect(regen.calls.flatMap((call) => call.issues)).toEqual([]);
});
