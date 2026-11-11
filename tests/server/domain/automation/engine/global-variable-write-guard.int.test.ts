// A rule writes the per-user global plane through the same guard as the set verb. A plugin tool's captured result,
// or a rendered value, that holds a NUL is the rule's action error and writes nothing, because the driver returns
// stored text cut at its first NUL; the same write without the NUL is stored. A rule cannot name a variable key that
// holds a NUL at all.
// @subject packages/server/src/domain/automation/persistence/queries.ts
// @subject packages/server/src/domain/automation/engine/arm-executors.ts
import { spawn } from "node:child_process";
import type { AutomationAction } from "@orb/contracts/automation";
import { ruleRefusalReason } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle } from "@orb/testkit/node/composed";

const NUL = "\0";
const CLEAN = "headtail";
const WITH_NUL = `head${NUL}tail`;
const KEY = "captured";

const MANIFEST = pluginManifestSchema.parse({
  id: "echoer",
  name: "Echoer",
  version: "1.0.0",
  hostVersion: PLUGIN_HOST_VERSIONS[0],
  entry: PLUGIN_MAIN_ENTRY,
  description: "Answers with the text it is given.",
  capabilities: ["tools.register"],
});
const TOOL = "echo";
const TOOL_SOURCE = `orb.host(1).tools.register({
  name: ${JSON.stringify(TOOL)},
  description: "Answer with the text it is given.",
  parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false },
  handler: async (args) => args.text,
});`;

interface Room {
  readonly root: ServerTestHarness;
  readonly owner: Principal;
  readonly chatId: ChatId;
}

async function roomWithEchoTool(root: ServerTestHarness): Promise<Room> {
  const owner = await root.principalFor(root.ownerId);
  const chatId = (await root.services.chat.startChat({ principal: owner, characterIds: [], opening: "none" })).chat.id;
  const installed = await root.services.plugin.install({ caller: owner, bundle: makePluginBundle(MANIFEST, TOOL_SOURCE, root.clock.now()), grant: [] });
  await root.services.plugin.setGrant({ caller: owner, pluginId: installed.id, grant: MANIFEST.capabilities, acknowledgedNetHosts: [], enable: true });
  return { root, owner, chatId };
}

async function runRule(room: Room, action: AutomationAction): Promise<string> {
  const rule = await room.root.services.automation.createRule({
    principal: room.owner,
    chatId: room.chatId,
    name: `write ${String(room.root.clock.now())}`,
    timeZone: UTC_TIME_ZONE,
    trigger: { bus: "chat", type: "messageCommitted" },
    actions: [action],
  });
  await room.root.services.automation.setRuleEnabled({ principal: room.owner, ruleId: rule.id, enabled: true });
  return (await room.root.services.automation.runRuleNow({ principal: room.owner, ruleId: rule.id })).outcome;
}

const WRITES = [
  {
    name: "a plugin tool's captured result",
    action: (text: string): AutomationAction => ({
      type: "run_tool",
      name: pluginToolWireName(MANIFEST.id, TOOL),
      argsTemplate: JSON.stringify({ text }),
      resultVar: KEY,
      resultScope: "global",
    }),
  },
  {
    name: "a rendered set_variable value",
    action: (text: string): AutomationAction => ({ type: "set_variable", scope: "global", key: KEY, op: "set", value: text }),
  },
] as const;

test.for(WRITES)("$name holding a NUL is the rule's action error and writes nothing; without the NUL it is stored", { tags: ["slow"] }, async ({ action }) => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const room = await roomWithEchoTool(root);
  const stored = (): Promise<string | null> => root.services.automation.getGlobalVariable({ principal: room.owner, key: KEY });

  expect(await runRule(room, action(WITH_NUL))).toBe("action_error");
  expect(await stored()).toBeNull();
  expect(await runRule(room, action(CLEAN))).toBe("fired");
  expect(await stored()).toBe(CLEAN);
});

const KEYED = [
  { name: "set_variable key", action: (key: string): AutomationAction => ({ type: "set_variable", scope: "global", key, op: "set", value: CLEAN }) },
  {
    name: "run_tool result variable",
    action: (key: string): AutomationAction => ({
      type: "run_tool",
      name: pluginToolWireName(MANIFEST.id, TOOL),
      argsTemplate: JSON.stringify({ text: CLEAN }),
      resultVar: key,
      resultScope: "global",
    }),
  },
] as const;

test.for(KEYED)("a rule whose $name holds a NUL is refused at authoring; the same key without it is created", { tags: ["slow"] }, async ({ action }) => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const room = await roomWithEchoTool(root);
  const create = (key: string): ReturnType<typeof root.services.automation.createRule> =>
    root.services.automation.createRule({
      principal: room.owner,
      chatId: room.chatId,
      name: `keyed ${key.length}`,
      timeZone: UTC_TIME_ZONE,
      trigger: { bus: "chat", type: "messageCommitted" },
      actions: [action(key)],
    });

  await expect(create(`${KEY}${NUL}tail`)).rejects.toMatchObject({ code: ruleRefusalReason("bad_action") });
  expect(await root.services.automation.listRules({ principal: room.owner, chatId: room.chatId })).toEqual([]);
  await expect(create(KEY)).resolves.toMatchObject({ chatId: room.chatId });
});
