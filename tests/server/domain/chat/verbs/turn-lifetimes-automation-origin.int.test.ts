// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/automation/engine/dispatch.ts
import { AUTOMATION_DEPTH_HARD_CAP } from "@orb/contracts/chat";
import { automationFires, chatGenerationObservations, messages, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { seedCorpusConnections } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { enabledRule } from "../../automation/runtime.fixtures.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

const OWNER_KEY = "synthetic-tail-automation-owner-key";

test("a real host-authored cascade stamps each bounded automation depth, records its cap refusal and loses authority when its author becomes a member", async () => {
  await using h = await textRoom([...Array.from({ length: AUTOMATION_DEPTH_HARD_CAP }, (_, index) => `Automatic beat ${index + 1}.`), "The human asks next."], {
    group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
    server: { secretBoxKey: Buffer.alloc(32, 1) },
  });
  const connectionId = (await h.root.services.connection.listBindings({ principal: h.owner })).find(({ task }) => task === "chat")?.binding?.connectionId;
  if (connectionId === undefined || connectionId === null) {
    throw new Error("the real automation room has no saved chat connection");
  }
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "custom-openai", key: OWNER_KEY });
  await h.root.services.connection.update({ principal: h.owner, connectionId, patch: { credentialId: credential.id } });
  expect(await h.root.services.connection.get({ principal: h.owner, connectionId })).toMatchObject({ ownerId: h.owner.userId, credentialId: credential.id });
  const rule = await enabledRule(h.root, {
    chatId: h.chatId,
    name: "Real bounded origin chain",
    trigger: { bus: "chat", type: "messageCommitted" },
    matchAutomationEvents: true,
    actions: [{ type: "trigger_turn", confirmFirst: false }],
  });
  expect(await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id })).toEqual({ outcome: "fired" });
  await h.root.settleBackground();
  const canon = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(canon.map(({ role, initiator, automationDepth }) => ({ role, initiator, automationDepth }))).toEqual(
    Array.from({ length: AUTOMATION_DEPTH_HARD_CAP }, (_, index) => ({ role: "assistant", initiator: "automation", automationDepth: index + 1 })),
  );
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(AUTOMATION_DEPTH_HARD_CAP);
  const fires = await h.root.db.select().from(automationFires).where(eq(automationFires.ruleId, rule.id)).orderBy(automationFires.automationDepth);
  expect(fires.map(({ outcome, automationDepth }) => ({ outcome, automationDepth }))).toEqual([
    ...Array.from({ length: AUTOMATION_DEPTH_HARD_CAP }, (_, automationDepth) => ({ outcome: "fired", automationDepth })),
    { outcome: "depth_refused", automationDepth: AUTOMATION_DEPTH_HARD_CAP },
  ]);
  expect(fires.at(-1)?.detail).toEqual({ eventDepth: AUTOMATION_DEPTH_HARD_CAP });
  const generations = await h.root.db
    .select({ variant: messageVariants })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(eq(messages.chatId, h.chatId));
  expect(generations).toHaveLength(AUTOMATION_DEPTH_HARD_CAP);
  expect(generations.every(({ variant }) => variant.connectionId === connectionId && variant.connectionAttributionProvenance === "recorded")).toBe(true);
  expect(generations.every(({ variant }) => (variant.metadata?.usageLegs?.length ?? 0) > 0)).toBe(true);
  expect(h.requests.filter(({ method }) => method === "POST").map(({ headers }) => headers.get("authorization"))).toEqual(
    Array.from({ length: AUTOMATION_DEPTH_HARD_CAP }, () => `Bearer ${OWNER_KEY}`),
  );
  expect(await h.root.db.select().from(chatGenerationObservations).where(eq(chatGenerationObservations.chatId, h.chatId))).toEqual([]);

  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: false });
  const human = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Now a human turn." });
  expect(human.aborted).toBe(false);
  expect(human.messages.map(({ role }) => role)).toEqual(["user", "assistant"]);
  const afterHuman = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(afterHuman.slice(-2).map(({ initiator, automationDepth }) => ({ initiator, automationDepth }))).toEqual([
    { initiator: "human", automationDepth: 0 },
    { initiator: "human", automationDepth: 0 },
  ]);
  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: true });
  const successor = await invitePerson(h);
  await seedCorpusConnections(h.root, successor);
  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: successor.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: successor, chatId: h.chatId });
  const committed = await h.root.services.chat.commitMessage({ principal: successor, chatId: h.chatId, content: "The old rule author is now a member." });
  expect(committed.aborted).toBe(false);
  await h.root.settleBackground();
  const refused = await h.root.db.select().from(automationFires).where(eq(automationFires.ruleId, rule.id));
  expect(refused.filter(({ outcome }) => outcome === "authority_refused")).toMatchObject([{ automationDepth: 0, detail: { code: "author-lost-authority" } }]);
  expect(h.requests.filter(({ method }) => method === "POST")).toHaveLength(AUTOMATION_DEPTH_HARD_CAP + 1);
  const final = await h.root.db.select().from(messages).where(eq(messages.chatId, h.chatId)).orderBy(messages.seq);
  expect(final.filter(({ role }) => role === "assistant")).toHaveLength(AUTOMATION_DEPTH_HARD_CAP + 1);
  expect(final.at(-1)).toMatchObject({ role: "user", authorUserId: successor.userId, initiator: "human", automationDepth: 0 });
});
