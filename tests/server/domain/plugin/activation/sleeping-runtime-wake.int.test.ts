// A resident plugin whose runtime was retired for another wakes from its durable main.js on its next invocation.

import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { expect, test } from "@orb/testkit/node";
import { seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { strToU8, zipSync } from "fflate";
import { coreFrame, coreProse, coreSse } from "../../chat/engine/core-physical.ts";
import { turnToolsRoom } from "../../chat/verbs/turn-rpg-physical.ts";

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

/** The model calls `name` once, then answers in prose after the tool result. */
function toolTurn(name: string, id: string): readonly (() => Response)[] {
  return [
    (): Response =>
      coreSse([
        coreFrame({ choices: [{ delta: { ["tool_calls"]: [{ index: 0, id, type: "function", function: { name, arguments: "{}" } }] } }] }),
        terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 4, completionTokens: 2 } }),
      ]),
    (): Response => coreProse("Done."),
  ];
}

test("a plugin retired from the one warm worker answers again after its runtime wakes from the stored bundle", { tags: ["slow"] }, async () => {
  const plugins = [manifest("wake-alpha"), manifest("wake-beta")] as const;
  const [alpha, beta] = plugins.map((plugin) => pluginToolWireName(plugin.id, TOOL));
  if (alpha === undefined || beta === undefined) {
    throw new Error("both plugins register their tool");
  }
  // One worker holds one runtime: beta's activation retires alpha's, and each call retires the other plugin's.
  await using h = await turnToolsRoom([...toolTurn(alpha, "wake-1"), ...toolTurn(beta, "wake-2"), ...toolTurn(alpha, "wake-3")], {
    server: { pluginSpawn: spawn, env: { ["PLUGIN_BROKER_WORKER_MAX"]: "1" } },
  });
  for (const plugin of plugins) {
    const installed = await seedInstalledPlugin(h.root, { caller: h.owner, bundle: bundle(plugin), grant: [] });
    const enabled = await seedPluginGrant(h.root, {
      caller: h.owner,
      pluginId: installed.outcome.id,
      grant: plugin.capabilities,
      acknowledgedNetHosts: [],
      enable: true,
    });
    expect(enabled.outcome.status).toBe("enabled");
  }
  const answered: unknown[] = [];
  for (const content of ["First.", "Second.", "Third."]) {
    const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content });
    expect(outcome.aborted).toBe(false);
    answered.push(...(outcome.messages.find((message) => message.role === "assistant")?.toolCalls ?? []));
  }
  expect(answered).toMatchObject([
    { name: alpha, isError: false, result: "wake-alpha" },
    { name: beta, isError: false, result: "wake-beta" },
    { name: alpha, isError: false, result: "wake-alpha" },
  ]);
});
