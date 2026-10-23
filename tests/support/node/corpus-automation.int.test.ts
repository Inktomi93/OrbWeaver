// @subject tests/support/node/corpus-seed.ts
// @subject tests/support/node/factories/automation.ts
import { AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR, ownerBudgetViewSchema } from "@orb/contracts/automation";
import { assertReferentialIntegrity } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusAutomation, seedCorpusConnections } from "@orb/testkit/node/corpus-seed.ts";
import { makeAssetBytes } from "@orb/testkit/node/factories/asset.ts";
import { captureAutomationExecution, captureGlobalVariable, seedAutomationOwnerBudget, seedAutomationRule } from "@orb/testkit/node/factories/automation.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

function providerExecution(): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the completed ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
}

test("the corpus captures real condition, cap and manual provenance beside genuine private analysis state", async () => {
  const execution = providerExecution();
  await using root = await createServerHarness({ providerFetch: execution.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const room = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const capture = await seedCorpusAutomation(root, room.chat.id);
  expect(capture.dry.result.predicate).toBe(false);
  expect(capture.dry.fires.map((row) => row.outcome)).toEqual(["test_run"]);
  expect(capture.dry.fires[0]?.detail).toEqual(capture.dry.result);
  expect(capture.firstMiss.execution.fires).toEqual(capture.dry.fires);
  expect([
    capture.firstMiss.variable.value,
    capture.firstHit.variable.value,
    capture.secondMiss.variable.value,
    capture.secondHit.variable.value,
    capture.rateLimited.variable.value,
    capture.completed.variable.value,
  ]).toEqual(["0", "1", "1", "2", "2", "3"]);
  expect(capture.secondMiss.execution.fires.filter((row) => row.outcome === "predicate_false").map((row) => row.detail)).toEqual([null]);
  expect(capture.rateLimited.execution.fires.filter((row) => row.outcome === "budget_refused").map((row) => row.detail)).toEqual([{ limit: "owner_hourly" }]);
  expect(capture.manual.result.outcome).toBe("fired");
  const fired = capture.completed.execution.fires.filter((row) => row.outcome === "fired");
  expect(fired.filter((row) => row.detail === null)).toHaveLength(2);
  expect(fired.filter((row) => row.detail !== null).map((row) => row.detail)).toEqual([{ runNow: true, byUserId: root.ownerId }]);
  expect(new Set(fired.map((row) => row.id)).size).toBe(3);
  expect(new Set(fired.map((row) => row.firedAt)).size).toBe(1);
  expect(capture.completed.execution.state).toBeUndefined();
  expect(capture.globalRule).toMatchObject({ ownerId: root.ownerId, chatId: null, enabled: true });
  expect(capture.analysisRule).toMatchObject({ ownerId: root.ownerId, chatId: room.chat.id, enabled: true });
  expect(capture.analysis.result.outcome).toBe("fired");
  expect(capture.analysis.state).toMatchObject({
    ruleId: capture.analysisRule.id,
    guidance: "Keep the ledger's witnesses and completed scenes consistent.",
    state: { arc: "Preserve the orbital ledger.", twists: ["A courier brings the missing loom tool."] },
  });
  expect(execution.requests.filter((request) => request === "POST /v1/chat/completions")).toHaveLength(1);
  const caller = await root.internalCallerFor(root.ownerId);
  expect(ownerBudgetViewSchema.parse(await caller.automation.getOwnerBudgets())).toEqual({ maxFiresPerHour: capture.budget.maxFiresPerHour });
  await assertReferentialIntegrity(root.db);
});

test("a stranger's real asset event cannot change the owner's admitted automation ledger or variables", async () => {
  const execution = providerExecution();
  await using root = await createServerHarness({ providerFetch: execution.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const room = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const capture = await seedCorpusAutomation(root, room.chat.id);
  await seedAutomationOwnerBudget(root, { principal, maxFiresPerHour: capture.budget.maxFiresPerHour + 2 });
  const actor = await root.actor();
  const foreign = await root.principalFor(actor.id);
  await root.app.assets.store({ principal: foreign, kind: "gallery", mime: "image/png", bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)) });
  await root.settleBackground();
  expect(await captureAutomationExecution(root.db, capture.globalRule.id)).toEqual(capture.completed.execution);
  expect(await captureGlobalVariable(root.db, root.ownerId, capture.completed.variable.key)).toEqual(capture.completed.variable);
  expect(await root.services.automation.getGlobalVariable({ principal: foreign, key: capture.completed.variable.key })).toBeNull();
});

test("scope-invalid rules and over-bound budgets refuse before the corpus captures any invented row", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const automation = root.services.automation;
  const before = await automation.listOwnerRules({ principal });
  await expect(
    seedAutomationRule(root, {
      principal,
      chatId: null,
      name: "Invalid global director",
      trigger: { bus: "domain", type: "asset.created" },
      timeZone: UTC_TIME_ZONE,
      actions: [{ type: "run_analysis", brief: "This needs a real room.", routes: { steer: { apply: "direct" } } }],
    }),
  ).rejects.toThrow("needs a chat");
  expect(await automation.listOwnerRules({ principal })).toEqual(before);
  const budget = await seedAutomationOwnerBudget(root, { principal, maxFiresPerHour: 2 });
  await expect(seedAutomationOwnerBudget(root, { principal, maxFiresPerHour: AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR + 1 })).rejects.toThrow("maxFiresPerHour");
  expect(await automation.getOwnerBudgets({ principal })).toEqual({ maxFiresPerHour: budget.maxFiresPerHour });
});
