// @subject tests/support/node/factories/automation-view.ts
// @subject tests/support/node/factories/automation.ts
import "../composed-real.ts";
import { spawn } from "node:child_process";
import type { AutomationBusEvent } from "@orb/contracts/automation";
import { automationRuleCreateSchema, automationRuleToolViewSchema, RULE_PRESET_IDS } from "@orb/contracts/automation";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { seedCorpusAutomation, seedCorpusConnections } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { captureAutomationViews, seedAutomationConfirmation, seedAutomationRule, seedAutomationRun, seedCreatedAutomationRule } from "./automation.ts";
import { makeRuleView } from "./automation-view.ts";
import { makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "./plugin.ts";
import { seedChatBook, seedWorldBook } from "./world-info.ts";

const TOOL_NAME = "echo";
const TOOL_DESCRIPTION = "Return the authored execution marker.";
const TOOL_RESULT_KEY = "executionToolResult";
const TOOL_MARKER = "native-call";
const TOOL_PARAMETERS = { type: "object", properties: { marker: { type: "string" } }, required: ["marker"], additionalProperties: false };
const TOOL_MANIFEST = pluginManifestSchema.parse({
  id: "execution-tools",
  name: "Execution output tools",
  version: "1.0.0",
  description: "Supplies one real drivable tool.",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  capabilities: ["tools.register"],
});
const TOOL_SOURCE = `let calls = 0; orb.host(1).tools.register({ name: ${JSON.stringify(TOOL_NAME)}, description: ${JSON.stringify(TOOL_DESCRIPTION)}, parameters: ${JSON.stringify(TOOL_PARAMETERS)}, handler: (args) => String(++calls) + ":" + args.marker });`;

async function nextSuggestion(events: AsyncIterator<AutomationBusEvent>): Promise<Extract<AutomationBusEvent, { type: "suggestionRaised" }>> {
  for (;;) {
    const next = await events.next();
    if (next.done) {
      throw new Error("native automation stream ended before raising the ask");
    }
    if (next.value.type === "suggestionRaised") {
      return next.value;
    }
  }
}

test("the rule default admits its actual scope and matches native birth defaults without exposing its author", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const expected = makeRuleView();
  const input = automationRuleCreateSchema.strip().parse({
    ...expected,
    timeZone: UTC_TIME_ZONE,
    creationRequestId: root.idSource.typeId(ID_PREFIX.automationRuleCreation),
  });
  const created = await seedCreatedAutomationRule(root, { ...input, principal });
  expect(created.view).toEqual({ ...expected, id: created.row.id });
  expect(created.row).toMatchObject({
    id: created.view.id,
    ownerId: root.ownerId,
    creationRequestId: input.creationRequestId,
    createdAt: root.clock.now(),
    updatedAt: root.clock.now(),
  });
  expect(created.view).not.toHaveProperty("ownerId");
  expect(created.view).not.toHaveProperty("creationRequestId");
});

test("native automation read suppliers keep rule scope, preset provenance, fire identity and the installer's tool metadata", async () => {
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The completed execution preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: execution.execute, pluginSpawn: spawn });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const room = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const produced = await seedCorpusAutomation(root, room.chat.id);
  const installed = await seedInstalledPlugin(root, {
    caller: principal,
    bundle: makePluginBundle(TOOL_MANIFEST, TOOL_SOURCE, root.clock.now()),
    grant: [],
  });
  const enabled = await seedPluginGrant(root, {
    caller: principal,
    pluginId: installed.plugin.id,
    grant: TOOL_MANIFEST.capabilities,
    acknowledgedNetHosts: [],
    enable: true,
  });
  expect(enabled.outcome.status).toBe("enabled");
  const capture = await captureAutomationViews(root, { principal, chatId: room.chat.id, ruleId: produced.analysisRule.id });
  expect(capture.rules.map((rule) => rule.id)).toContain(produced.analysisRule.id);
  expect(capture.rules.map((rule) => rule.id)).not.toContain(produced.globalRule.id);
  expect(capture.ownerRules.map((rule) => rule.id)).toContain(produced.globalRule.id);
  expect(capture.ownerRules.map((rule) => rule.id)).not.toContain(produced.analysisRule.id);
  expect(capture.fires.map((fire) => [fire.id, fire.ruleId, fire.chatId, fire.outcome])).toEqual(
    produced.analysis.fires.map((fire) => [fire.id, fire.ruleId, fire.chatId, fire.outcome]),
  );
  expect(capture.activity.map((fire) => fire.id)).toEqual(capture.fires.map((fire) => fire.id));
  expect(capture.activity.every((fire) => fire.chatId === room.chat.id)).toBe(true);
  const globalFires = await root.services.automation.listFires({ principal, ruleId: produced.globalRule.id });
  expect(globalFires.map((fire) => fire.id)).toEqual(expect.arrayContaining(produced.completed.execution.fires.map((fire) => fire.id)));
  expect(globalFires.every((fire) => fire.chatId === null && fire.ruleId === produced.globalRule.id)).toBe(true);
  expect(capture.presets.map((item) => item.id)).toEqual([...RULE_PRESET_IDS]);
  const preset = capture.presets.find((item) => item.id === "openerChips");
  if (preset === undefined) {
    throw new Error("native catalogue omitted its opener preset");
  }
  const caller = await root.internalCallerFor(root.ownerId);
  const minted = await caller.automation.createRuleFromPreset({ chatId: room.chat.id, presetId: preset.id, timeZone: UTC_TIME_ZONE });
  expect(minted).toHaveLength(preset.ruleCount);
  expect(minted.every((rule) => !rule.enabled && rule.rulePresetId === preset.id && rule.rulePresetKnobs !== null)).toBe(true);
  expect((await caller.automation.listRules({ chatId: room.chat.id })).map((rule) => rule.id)).toEqual([
    ...capture.rules.map((rule) => rule.id),
    ...minted.map((rule) => rule.id),
  ]);
  const name = pluginToolWireName(TOOL_MANIFEST.id, TOOL_NAME);
  expect(capture.tools).toContainEqual({
    name,
    description: TOOL_DESCRIPTION,
    parameters: automationRuleToolViewSchema.shape.parameters.parse(projectJsonSchema(liftJsonSchema(TOOL_PARAMETERS))),
  });
  const foreign = await root.actor();
  const other = await root.internalCallerFor(foreign.id);
  expect((await other.automation.listRuleTools()).map((tool) => tool.name)).not.toContain(name);
  expect((await other.automation.listOwnerRules()).map((rule) => rule.id)).not.toContain(produced.globalRule.id);
  await expect(other.automation.listChatActivity({ chatId: room.chat.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const invitationRule = await seedAutomationRule(root, {
    principal,
    chatId: room.chat.id,
    name: "Rate-limited native tool",
    timeZone: UTC_TIME_ZONE,
    trigger: { bus: "chat", type: "messageCommitted" },
    maxFiresPerHour: 1,
    actions: [{ type: "run_tool", name, argsTemplate: JSON.stringify({ marker: TOOL_MARKER }), resultVar: TOOL_RESULT_KEY, resultScope: "global" }],
  });
  await root.services.automation.setRuleEnabled({ principal, ruleId: invitationRule.id, enabled: true });
  const first = await seedAutomationRun(root, { principal, ruleId: invitationRule.id });
  expect(first.result).toEqual({ outcome: "fired" });
  const firstValue = await root.services.automation.getGlobalVariable({ principal, key: TOOL_RESULT_KEY });
  expect(firstValue).toContain(`1:${TOOL_MARKER}`);
  const cancellation = new AbortController();
  const events = root.app.liveBuses.automation
    .subscribeAutomation(room.chat.id, AbortSignal.any([cancellation.signal, AbortSignal.timeout(5000)]))
    [Symbol.asyncIterator]();
  try {
    const raised = nextSuggestion(events);
    await root.services.chat.commitMessage({ principal, chatId: room.chat.id, content: "The next witnessed beat meets the native fire cap." });
    await root.settleBackground();
    const ask = await raised;
    expect(ask.kind).toBe("invitation");
    expect(ask.source).toEqual({ kind: "rule", ruleId: invitationRule.id });
    const confirmed = await seedAutomationConfirmation(root, { principal, suggestionId: ask.suggestionId }, invitationRule.id);
    expect(confirmed.result).toEqual({ ran: "fresh-run", outcome: "fired" });
    expect(confirmed.fires.filter((fire) => fire.outcome === "fired")).toHaveLength(2);
    expect(await root.services.automation.getGlobalVariable({ principal, key: TOOL_RESULT_KEY })).toContain(`2:${TOOL_MARKER}`);
    expect(await root.services.automation.getGlobalVariable({ principal: await root.principalFor(foreign.id), key: TOOL_RESULT_KEY })).toBeNull();
  } finally {
    cancellation.abort();
    await events.return?.();
  }
  await root.services.plugin.setEnabled({ caller: principal, pluginId: installed.plugin.id, enabled: false });
  expect((await caller.automation.listRuleTools()).map((tool) => tool.name)).not.toContain(name);
});

test("a genuinely raised confirmation keeps its actor and fire identity while a stranger and a second claim are refused", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const room = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const book = await seedWorldBook(root, { principal, input: { name: "Confirmed execution ledger" } });
  await seedChatBook(root, { principal, chatId: room.chat.id, bookId: book.id });
  const rule = await seedAutomationRule(root, {
    principal,
    chatId: room.chat.id,
    name: "Ask before preserving canon",
    trigger: { bus: "chat", type: "messageCommitted" },
    timeZone: UTC_TIME_ZONE,
    actions: [
      {
        type: "insert_world_info_entry",
        bookId: book.id,
        entryKey: "Confirmed witness",
        contentTemplate: "The host preserved this witnessed fact.",
        keys: ["witness"],
        confirmFirst: true,
      },
    ],
  });
  await root.services.automation.setRuleEnabled({ principal, ruleId: rule.id, enabled: true });
  const cancellation = new AbortController();
  const events = root.app.liveBuses.automation.subscribeAutomation(room.chat.id, cancellation.signal)[Symbol.asyncIterator]();
  try {
    const next = nextSuggestion(events);
    const run = await seedAutomationRun(root, { principal, ruleId: rule.id });
    expect(run.result).toEqual({ outcome: "suggested" });
    expect(run.fires).toEqual([]);
    const raised = await next;
    expect(raised.source).toEqual({ kind: "rule", ruleId: rule.id });
    const foreign = await root.principalFor((await root.actor()).id);
    const params = { principal, suggestionId: raised.suggestionId };
    await expect(seedAutomationConfirmation(root, { ...params, principal: foreign }, rule.id)).rejects.toThrow();
    const confirmed = await seedAutomationConfirmation(root, params, rule.id);
    expect(confirmed.result).toEqual({ ran: "stashed-arm", outcome: "fired" });
    expect(confirmed.fires).toMatchObject([
      { ruleId: rule.id, chatId: room.chat.id, outcome: "fired", detail: { confirmedByUserId: principal.userId, suggestionId: params.suggestionId } },
    ]);
    const entries = await root.services.worldInfo.listEntries({ principal, bookId: book.id });
    expect(entries.map((entry) => [entry.worldBookId, entry.content, entry.keys])).toEqual([[book.id, "The host preserved this witnessed fact.", ["witness"]]]);
    await expect(seedAutomationConfirmation(root, params, rule.id)).rejects.toThrow();
    expect(await root.services.worldInfo.listEntries({ principal, bookId: book.id })).toEqual(entries);
  } finally {
    cancellation.abort();
    await events.return?.();
  }
});
