// `run_analysis` is quiet extraction under D285: a side model never reads a hidden span, and a reply carrying one is not audited.
// @subject packages/server/src/domain/automation/engine/analysis-arm.ts
// @subject packages/server/src/domain/automation/persistence/canon-reads.ts

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

const VISIBLE = "The gate stands open.";
const SECRET = "ledger-truth";
const AUDIT_LABEL = "AUDITED REPLY";

async function analysisPrompt(reply: string): Promise<string> {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  replies.set("run_analysis", JSON.stringify({ rewrite: { verdict: "sound", after: "" } }));
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: reply,
    structuredReplies: replies,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: physical.execute, memoryEnabled: false });
  await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  const rule = await h.root.services.automation.createRule({
    principal: h.owner,
    chatId: h.chatId,
    name: "Audit",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "run_analysis", brief: "Audit the reply.", routes: { rewrite: {} } }],
  });
  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: true });
  const before = h.requests.length;
  await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id });
  const passes = h.requests.slice(before).filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  return (await Promise.all(passes.map((pass) => pass.clone().text()))).join("\n");
}

test("a clean reply is read and audited", async () => {
  const prompt = await analysisPrompt(VISIBLE);
  expect(prompt).toContain(VISIBLE);
  expect(prompt).toContain(AUDIT_LABEL);
});

test.each([
  ["a closed span", `${VISIBLE} <lie character="Witness" truth="${SECRET}"/>`],
  ["an unclosed span", `${VISIBLE} <lie character="Witness" truth="${SECRET}`],
  ["a broken span", `${VISIBLE} <lie truth="${SECRET}"> and on`],
])("%s stays out of the pass, and its reply is not audited", async (_name, reply) => {
  const prompt = await analysisPrompt(reply);
  expect(prompt).toContain(VISIBLE);
  expect(prompt).not.toContain(SECRET);
  expect(prompt).not.toContain(AUDIT_LABEL);
});
