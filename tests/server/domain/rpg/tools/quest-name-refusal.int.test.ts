// A quest action that names no known quest mints a quest only on create: complete, fail and update on an unknown
// name are dropped and recorded as refused on the turn's tool-call row, and a name matches with letter case and
// surrounding whitespace folded. Production entry: `chat.send` on the composed root, whose cheap post-commit
// tool round folds through `extractionToStateDelta`; read back through `rpg.getTrackerView` and
// `rpg.listTurnToolCalls`. Layer: server integration (the fold's refusal and the durable record).
// @subject packages/server/src/domain/rpg/tools/apply.ts

import { finiteReplies } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { cheapRoundRoom, narrative, QUEST_TOOL, round } from "../round-room.ts";

test("complete, fail and update on an unknown quest name are refused and recorded, while create mints and a folded name matches", async () => {
  using plan = finiteReplies("quest name refusals", [
    narrative("A dragon is sighted over the hills."),
    round([{ name: QUEST_TOOL, args: { name: "The Dragon", action: "create", description: "Drive off the dragon" } }]),
    narrative("The dragon flees; a wyrm stirs."),
    round([
      { name: QUEST_TOOL, args: { name: "  the dragon ", action: "complete" } },
      { name: QUEST_TOOL, args: { name: "The Wyrm", action: "fail" } },
      { name: QUEST_TOOL, args: { name: "The Lost Ring", action: "update", description: "Somewhere in the hills" } },
      { name: QUEST_TOOL, args: { name: "The Wyrm", action: "complete" } },
      { name: QUEST_TOOL, args: { name: "Hunt the Wyrm", action: "create" } },
    ]),
  ]);
  await using h = await cheapRoundRoom(plan.take);
  await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Watch the hills." });
  await h.root.settleBackground();
  const second = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Chase it off." });
  await h.root.settleBackground();

  const view = await h.root.services.rpg.getTrackerView({ principal: h.owner, chatId: h.chatId });
  expect(view.quests.map((quest) => [quest.name, quest.status])).toEqual([
    ["The Dragon", "completed"],
    ["Hunt the Wyrm", "active"],
  ]);
  const variantId = second.messages.find((message) => message.role === "assistant")?.selectedVariantId;
  const record = (await h.root.services.rpg.listTurnToolCalls({ principal: h.owner, chatId: h.chatId })).find((row) => row.variantId === variantId);
  expect(record?.calls.map((call) => call.verdict)).toEqual(["applied", "dropped", "dropped", "dropped", "applied"]);
  for (const refused of record?.calls.filter((call) => call.verdict === "dropped") ?? []) {
    expect(refused.issues).toHaveLength(1);
    expect(refused.issues[0]).toMatch(/^name: /);
  }
});
