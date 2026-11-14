// The analysis lore route writes model text into a room book, and a later turn renders that book through the
// macro engine. The model's brace runs must arrive as literal text: no read, and no variable write.
// @subject packages/server/src/domain/automation/engine/analysis-arm.ts

import { createBookSchema } from "@orb/contracts/world-info";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { wireOf, wireText } from "../../chat/scenario-physical.ts";

const KEYWORD = "gate";
const MODEL_LORE = "{{{setvar::seized::1}}}The gate is warded by {{{char}}} and {{{{{user}}}}}.";
// Well past the fresh window plus the protect tail, so the pass has a settled span to distill.
// The automation constants have no package door for tests to import them through.
const ROWS = 100;

function fold(text: string): string {
  return text.replace(/[^\p{L}\p{N}:]+/gu, " ").trim();
}

test("model lore with brace runs reaches the next turn as literal text and writes no variable", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  replies.set(
    "run_analysis",
    JSON.stringify({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [], lore: [{ key: "ward", keys: [KEYWORD], content: MODEL_LORE }] }),
  );
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The night passes.",
    structuredReplies: replies,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: physical.execute, memoryEnabled: false });
  for (let index = 0; index < ROWS; index += 1) {
    await h.caller.chat.commitMessage({ chatId: h.chatId, timeZone: UTC_TIME_ZONE, content: `Beat ${String(index)} at the ${KEYWORD}.` });
  }
  const book = await h.root.services.worldInfo.createBook({ principal: h.owner, input: createBookSchema.parse({ name: "Gate lore" }) });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  // A human entry on the same keyword is the control: it shows the turn evaluates the book's matched lore.
  await h.caller.worldInfo.createEntry({ bookId: book.id, input: { title: "control", keys: [KEYWORD], content: "{{setvar::control::1}}The gate is old." } });
  const rule = await h.root.services.automation.createRule({
    principal: h.owner,
    chatId: h.chatId,
    name: "Gate lore",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "run_analysis", brief: "Record the gate's lore.", routes: { lore: { apply: "direct", bookId: book.id } } }],
  });
  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: true });
  expect((await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id })).outcome).toBe("fired");

  const { newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: `We reach the ${KEYWORD}.` }));
  await h.root.settleBackground();

  const wire = fold(wireText(newest));
  expect(wire).toContain("The gate is old");
  expect(wire).toContain(fold(MODEL_LORE));
  expect(await h.root.services.chat.getRuntimeVariables({ principal: h.owner, chatId: h.chatId })).toEqual({ control: "1" });
});
