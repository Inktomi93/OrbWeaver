// @subject tests/support/node/factories/rows/automation.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { automationFires, automationRuleState } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { eq } from "drizzle-orm";
import { seedCorpusConnections } from "../corpus-actors.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { seedAutomationRun } from "./rows/automation.ts";
import { seedAutomationRuleRows, seedAutomationTestFiresRows } from "./rows.ts";

test("dry-run provenance and same-clock real fires retain distinct IDs without inventing analysis state", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const rule = await seedAutomationRuleRows(root, {
    principal,
    chatId: null,
    name: "Count manual runs",
    trigger: { bus: "domain", type: "character.updated" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "set_variable", scope: "global", key: "manualRuns", op: "inc" }],
  });
  const params = { principal, ruleId: rule.id };
  const dry = await seedAutomationTestFiresRows(root, params);
  expect(dry.result.predicate).toBe(false);
  expect(dry.fires.map((row) => row.outcome)).toEqual(["test_run"]);
  expect(dry.fires[0]?.detail).toEqual(dry.result);
  expect(await root.services.automation.getGlobalVariable({ principal, key: "manualRuns" })).toBeNull();
  await expect(seedAutomationRun(root, params)).rejects.toThrow("disabled");
  await root.services.automation.setRuleEnabled({ ...params, enabled: true });
  const first = await seedAutomationRun(root, params);
  expect(first.result.outcome).toBe("fired");
  const second = await seedAutomationRun(root, params);
  expect(second.result.outcome).toBe("fired");
  expect(second.state).toBeUndefined();
  expect(await root.services.automation.getGlobalVariable({ principal, key: "manualRuns" })).toBe("2");
  expect(second.fires.filter((row) => row.outcome === "test_run")).toEqual(dry.fires);
  const fired = second.fires.filter((row) => row.outcome === "fired");
  expect(fired.map((row) => row.detail)).toEqual([
    { runNow: true, byUserId: principal.userId },
    { runNow: true, byUserId: principal.userId },
  ]);
  expect(new Set(fired.map((row) => row.id)).size).toBe(2);
  expect(new Set(fired.map((row) => row.firedAt)).size).toBe(1);
  expect(fired.every((row) => row.ruleId === rule.id && row.chatId === null)).toBe(true);
});

test("foreign rule captures refuse before provenance or arm effects", async () => {
  await using root = await createServerHarness();
  const actor = await root.actor();
  const principal = await root.principalFor(actor.id);
  const rule = await seedAutomationRuleRows(root, {
    principal,
    chatId: null,
    name: "Private counter",
    trigger: { bus: "domain", type: "character.updated" },
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "set_variable", scope: "global", key: "privateCounter", op: "inc" }],
  });
  await root.services.automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
  const foreignParams = { principal: await root.principalFor(root.ownerId), ruleId: rule.id };
  await expect(seedAutomationTestFiresRows(root, foreignParams)).rejects.toThrow();
  await expect(seedAutomationRun(root, foreignParams)).rejects.toThrow();
  expect(await root.db.select().from(automationFires).where(eq(automationFires.ruleId, rule.id))).toEqual([]);
  expect(await root.services.automation.getGlobalVariable({ principal, key: "privateCounter" })).toBeNull();
});

test("real structured analysis produces private state, strips the unauthored score and preserves state on rejected output", async () => {
  const replies = new Map(CORPUS_STRUCTURED_REPLIES);
  const guidance = "Keep {{getglobalvar::privateCounter}} inert.";
  replies.set(
    "run_analysis",
    JSON.stringify({
      arcStatus: "active",
      updatedArc: "Repair the orbital loom.",
      successorArc: null,
      twistOps: [{ op: "add", twist: "A shuttle carries a missing tool." }],
      guidance,
      score: 99,
    }),
  );
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom.",
    structuredReplies: replies,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const character = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle: "analysis-subject", name: "Traveller", description: "A traveller repairs the orbital loom." }),
  });
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  await root.services.chat.commitMessage({ principal, chatId: chat.id, content: "The crew reaches the orbital loom." });
  const rule = await seedAutomationRuleRows(root, {
    principal,
    chatId: chat.id,
    name: "Private story direction",
    trigger: { bus: "chat", type: "messageCommitted" },
    predicateCel: "false",
    timeZone: UTC_TIME_ZONE,
    actions: [{ type: "run_analysis", brief: "Keep track of the repair.", routes: { steer: { apply: "direct" } } }],
  });
  const params = { principal, ruleId: rule.id };
  await root.services.automation.setRuleEnabled({ ...params, enabled: true });
  const produced = await seedAutomationRun(root, params);
  expect(produced.result.outcome).toBe("fired");
  expect(produced.state).toMatchObject({
    ruleId: rule.id,
    guidance,
    state: {
      arc: "Repair the orbital loom.",
      twists: ["A shuttle carries a missing tool."],
      retiredTwists: [],
      settledThroughSeq: null,
    },
  });
  expect(await root.services.chat.getVariables({ principal, chatId: chat.id })).not.toHaveProperty("score");
  replies.set("run_analysis", JSON.stringify({ arcStatus: "active", updatedArc: 17, successorArc: null, twistOps: [], guidance: "Do not persist this." }));
  const refused = await seedAutomationRun(root, params);
  expect(refused.result.outcome).toBe("action_error");
  expect(refused.state).toEqual(produced.state);
  expect(await root.db.select().from(automationRuleState).where(eq(automationRuleState.ruleId, rule.id)).get()).toEqual(produced.state);
  expect(refused.fires.filter((row) => row.outcome === "action_error")).toHaveLength(1);
});
