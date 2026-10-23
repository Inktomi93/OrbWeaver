// @subject packages/server/src/domain/automation/engine/analysis-arm.ts
// @subject packages/server/src/domain/automation/contract/analysis.ts
// A cold analysis pass over a room numbered from seq 0 reads its opening row into the settled window.
import { createBookSchema } from "@orb/contracts/world-info";
import { automationRuleState, messages } from "@orb/db";
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
import { eq, sql } from "drizzle-orm";

const OPENING = "The opening oath is sworn at the old gate.";
// Well past the fresh window plus the protect tail, so only the settled window can carry the opening row.
// The automation constants have no package door for tests to import them through.
const ROWS = 100;

test("a cold lore pass over a room numbered from seq 0 summarizes that opening row", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  replies.set("run_analysis", JSON.stringify({ arcStatus: "active", updatedArc: null, successorArc: null, twistOps: [], lore: [] }));
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused reply",
    structuredReplies: replies,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: physical.execute, memoryEnabled: false });
  for (let index = 0; index < ROWS; index += 1) {
    await h.caller.chat.commitMessage({ chatId: h.chatId, timeZone: UTC_TIME_ZONE, content: index === 0 ? OPENING : `Beat ${index} at the gate.` });
  }
  // Launched imports hold canon numbered from 0; shift this room's canon to that shape.
  await h.root.db
    .update(messages)
    .set({ seq: sql`${messages.seq} - 1` })
    .where(eq(messages.chatId, h.chatId));
  const book = await h.root.services.worldInfo.createBook({ principal: h.owner, input: createBookSchema.parse({ name: "Gate lore" }) });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
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
  const before = h.requests.length;

  expect((await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id })).outcome).toBe("fired");
  const passes = h.requests.slice(before).filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(passes).toHaveLength(1);
  expect(await passes[0]?.clone().text()).toContain(OPENING);
  const stored = await h.root.db.select({ state: automationRuleState.state }).from(automationRuleState).where(eq(automationRuleState.ruleId, rule.id)).get();
  expect(stored?.state).toMatchObject({ settledThroughSeq: expect.any(Number) });
});
