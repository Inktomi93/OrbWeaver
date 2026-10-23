// @subject packages/server/src/domain/chat/engine/engine.ts
// Actual automation actions produce origin stamps and world-info depth through the composed chat door.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import { messages } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import { eq } from "drizzle-orm";
import { enabledRule } from "../../automation/runtime.fixtures.ts";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

test("human and real chained automation turns retain their origin and publish the actual activated lore at depths zero, one and two", async () => {
  const response = (): Response =>
    coreSse([
      coreFrame({ choices: [{ delta: { content: "The keeper records this beat." } }] }),
      terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } }),
    ]);
  await using h = await coreHttpRoom([response, response, response]);
  const book = await h.root.services.worldInfo.createBook({ principal: h.owner, input: createBookSchema.parse({ name: "The keeper's constant scene" }) });
  const entry = await h.root.services.worldInfo.createEntry({
    principal: h.owner,
    bookId: book.id,
    input: createEntrySchema.parse({ title: "Keeper", content: "The keeper guards an orbital ledger.", metadata: { scopeMode: "always" } }),
  });
  await h.root.services.worldInfo.attachToChat({ principal: h.owner, chatId: h.chatId, bookId: book.id });
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  expect((await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId })).aborted).toBe(false);
  await h.root.services.automation.setGlobalVariable({ principal: h.owner, key: "coreBeats", value: "0" });
  const rule = await enabledRule(h.root, {
    chatId: h.chatId,
    name: "A bounded actual origin chain",
    trigger: { bus: "chat", type: "messageCommitted" },
    matchAutomationEvents: true,
    predicateCel: "int(global.coreBeats) < 2",
    actions: [{ type: "set_variable", scope: "global", key: "coreBeats", op: "inc" }, { type: "trigger_turn" }],
  });
  expect(await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id })).toEqual({ outcome: "fired" });
  await h.root.settleBackground();
  expect(await h.root.services.automation.getGlobalVariable({ principal: h.owner, key: "coreBeats" })).toBe("2");
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon).toMatchObject([
    { role: "assistant", kind: "standard", initiator: "human", automationDepth: 0 },
    { role: "assistant", kind: "standard", initiator: "automation", automationDepth: 1 },
    { role: "assistant", kind: "standard", initiator: "automation", automationDepth: 2 },
  ]);
  expect(canon).toHaveLength(3);
  expect(events.filter((event) => event.type === "worldInfoActivated")).toMatchObject([
    { chatId: h.chatId, entryIds: [entry.id], automationDepth: 0 },
    { chatId: h.chatId, entryIds: [entry.id], automationDepth: 1 },
    { chatId: h.chatId, entryIds: [entry.id], automationDepth: 2 },
  ]);
  expect(events.filter((event) => event.type === "turnAborted")).toEqual([]);
  expect(h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toHaveLength(3);
});
