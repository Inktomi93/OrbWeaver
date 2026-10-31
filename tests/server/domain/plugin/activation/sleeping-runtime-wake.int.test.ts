// A resident plugin whose runtime was retired for another wakes from its durable main.js on its next invocation.

import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { strToU8, zipSync } from "fflate";

const TOOL = "ping";

function manifest(id: string): PluginManifest {
  return pluginManifestSchema.parse({
    id,
    name: `Wake ${id}`,
    description: "Answers one tool call with its own id.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["tools.register"],
  });
}

function bundle(plugin: PluginManifest): Uint8Array {
  const guest = `orb.host(1).tools.register({
  name: ${JSON.stringify(TOOL)},
  description: "Answer with this plugin's id.",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  handler: async () => ${JSON.stringify(plugin.id)},
});`;
  return zipSync({ [PLUGIN_MANIFEST_ENTRY]: strToU8(JSON.stringify(plugin)), [PLUGIN_MAIN_ENTRY]: strToU8(guest) });
}

test("a plugin retired from the one warm worker answers again after its runtime wakes from the stored bundle", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, env: { ["PLUGIN_BROKER_WORKER_MAX"]: "1" } });
  const owner = await root.principalFor(root.ownerId);
  const chatId = (await root.services.chat.startChat({ principal: owner, characterIds: [], opening: "none" })).chat.id;
  const names: string[] = [];
  for (const plugin of [manifest("wake-alpha"), manifest("wake-beta")]) {
    const installed = await seedInstalledPlugin(root, { caller: owner, bundle: bundle(plugin), grant: [] });
    const enabled = await seedPluginGrant(root, {
      caller: owner,
      pluginId: installed.outcome.id,
      grant: plugin.capabilities,
      acknowledgedNetHosts: [],
      enable: true,
    });
    expect(enabled.outcome.status).toBe("enabled");
    names.push(pluginToolWireName(plugin.id, TOOL));
  }
  // The host's seat role, read through chat's own room read as the turn engine's membership carries it.
  const role = (await root.services.chat.getChat({ principal: owner, chatId })).participants.find((participant) => participant.userId === owner.userId)?.role;
  if (role === undefined) {
    throw new Error("the owner hosts the room");
  }
  const call = async (name: string): Promise<unknown> =>
    (
      await root.app.toolUse.executeToolCalls(root.app.toolUse.resolveTools(owner.userId, [name]), [{ toolCallId: `wake-${name}`, name, arguments: "{}" }], {
        principal: owner,
        triggeredBy: owner.userId,
        chatId,
        turnId: null,
        membership: { role },
      })
    )[0];
  const [alpha, beta] = names;
  if (alpha === undefined || beta === undefined) {
    throw new Error("both plugins registered their tool");
  }

  // One worker holds one runtime: beta's activation retired alpha's, and each call retires the other plugin's.
  expect(await call(alpha)).toMatchObject({ isError: false, result: "wake-alpha" });
  expect(await call(beta)).toMatchObject({ isError: false, result: "wake-beta" });
  expect(await call(alpha)).toMatchObject({ isError: false, result: "wake-alpha" });
});
