import { spawn } from "node:child_process";
import { PLUGIN_MAIN_ENTRY, PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX, PLUGIN_UI_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle, seedCorpusActors, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { strToU8 } from "fflate";
import { z } from "zod";

const VARIABLE_KEY = "relayWitness";
const VARIABLE_VALUE = "mounted room value";
const MAIN_SOURCE = `const h = orb.host(1);
h.ui.register({id:"relay",anchor:"chat-flank",title:"Relay",tier:"scripted"});
h.ui.registerCommand({name:"seed",describe:"Seed the relay witness",onRun:async()=>{
  await h.chat.applyVariableOps(h.chat.current(),[{op:"set",key:${JSON.stringify(VARIABLE_KEY)},value:${JSON.stringify(VARIABLE_VALUE)}}]);
}});`;

test("scripted chat reads use admitted mount scope, reject main-host argument shapes and preserve private CAS", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const { owner: caller, secondUserId } = await seedCorpusActors(root);
  const manifest = pluginManifestSchema.parse({
    id: "ui-relay-abi",
    name: "UI relay ABI",
    version: "1.0.0",
    hostVersion: 1,
    entry: PLUGIN_MAIN_ENTRY,
    uiEntry: PLUGIN_UI_ENTRY,
    description: "Mounted room relay behavior",
    capabilities: ["chat.read", "chat.variables.write", "storage.kv", "ui.surface"],
  });
  const installed = await seedInstalledPlugin(root, {
    caller,
    grant: [],
    bundle: makePluginBundle(manifest, MAIN_SOURCE, root.clock.now(), { [PLUGIN_UI_ENTRY]: strToU8("orb.ui(1);") }),
  });
  const pluginId = installed.outcome.id;
  expect((await seedPluginGrant(root, { caller, pluginId, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true })).outcome.status).toBe(
    "enabled",
  );
  const room = await root.services.chat.startChat({ principal: caller, characterIds: [], opening: "none" });
  const chatId = room.chat.id;
  const committed = await root.services.chat.commitMessage({ principal: caller, chatId, content: "Mounted transcript witness." });
  expect(committed.aborted).toBe(false);
  expect(await root.services.plugin.listSurfaces({ caller })).toContainEqual(expect.objectContaining({ id: "relay", tier: "scripted" }));
  await root.services.plugin.invokeUiCommand({ caller, pluginId, name: "seed", args: "", chatId });

  const relay = (fn: string, args: readonly z.input<typeof jsonValueSchema>[]): ReturnType<typeof root.services.plugin.uiHostCall> =>
    root.services.plugin.uiHostCall({ caller, pluginId, chatId, fn, argsJson: JSON.stringify(args) });
  const variables = await relay("chat.getVariables", []);
  expect(jsonValueSchema.parse(JSON.parse(variables.resultJson))).toEqual({ [VARIABLE_KEY]: VARIABLE_VALUE });
  const messages = await relay("chat.listMessages", [{ limit: 1 }]);
  expect(jsonValueSchema.parse(JSON.parse(messages.resultJson))).toEqual([
    expect.objectContaining({ id: committed.messages[0]?.id, role: "user", content: "Mounted transcript witness." }),
  ]);
  expect(jsonValueSchema.parse(JSON.parse((await relay("chat.listMessages", [])).resultJson))).toHaveLength(1);
  await expect(relay("chat.getVariables", [chatId])).rejects.toBeInstanceOf(z.ZodError);
  await expect(relay("chat.listMessages", [chatId, { limit: 1 }])).rejects.toBeInstanceOf(z.ZodError);
  await expect(relay("chat.listMessages", [{ limit: PLUGIN_UI_CHAT_MESSAGES_LIMIT_MAX + 1 }])).rejects.toBeInstanceOf(z.ZodError);

  expect(jsonValueSchema.parse(JSON.parse((await relay("storage.compareAndSet", ["cell", null, "first"])).resultJson))).toEqual({
    applied: true,
    current: "first",
  });
  expect(jsonValueSchema.parse(JSON.parse((await relay("storage.compareAndSet", ["cell", null, "second"])).resultJson))).toEqual({
    applied: false,
    current: "first",
  });
  expect(jsonValueSchema.parse(JSON.parse((await relay("storage.get", ["cell"])).resultJson))).toBe("first");

  const foreign = await root.principalFor(secondUserId);
  const foreignRoom = await root.services.chat.startChat({ principal: foreign, characterIds: [], opening: "none" });
  await expect(
    root.services.plugin.uiHostCall({ caller, pluginId, chatId: foreignRoom.chat.id, fn: "chat.listMessages", argsJson: "[]" }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.plugin.uiHostCall({ caller, pluginId, fn: "chat.getVariables", argsJson: "[]" })).rejects.toThrow("needs a chat scope");
});
