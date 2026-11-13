// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// A stall after a command returned leaves its plugin a strike owed to the next write-path call (D347). A display call
// in between counts nothing, so it must leave that strike owed: it runs on a fresh runtime, and the next command still
// takes the strike. The strike count is read from the plugin's row, which no door shows.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import { PLUGIN_INVOCATION_CPU_MS, PLUGIN_WORKER_OVERRUN_MAX_MS, PLUGIN_WORKER_SPAN_CHECK_MS } from "#server/infra/plugin-host/budgets.ts";

// One string search of minutes with no interrupt poll inside it.
const NATIVE_STALL = "'a'.repeat(400000).indexOf('a'.repeat(100000) + 'b');";
const STALL_AFTER = "stall_after";
const PING = "ping";
const MARK = " [seen]";
// The command returns at once; the settlement of its floated call then runs the getter's stall, once.
const GUEST = `const h = orb.host(1);
h.ui.registerCommand({ name: ${JSON.stringify(STALL_AFTER)}, describe: "Stall after returning", onRun: () => { Object.defineProperty(Array.prototype, "then", { get() { if (globalThis.stalled) { return undefined; } globalThis.stalled = true; ${NATIVE_STALL} return undefined; }, configurable: true }); h.storage.list(""); return null; } });
h.ui.registerCommand({ name: ${JSON.stringify(PING)}, describe: "Read the store", onRun: async () => { await h.storage.get("k"); } });
h.transforms.registerDisplay({ name: "mark", apply: ({ text }) => text + ${JSON.stringify(MARK)} });`;
// Past the latest moment the broker ends a span that overran the outside account's window, with a window of slack.
const OUTSIDE_STALL_ENDED_MS = 2 * PLUGIN_INVOCATION_CPU_MS + PLUGIN_WORKER_OVERRUN_MAX_MS + 2 * PLUGIN_WORKER_SPAN_CHECK_MS;

function manifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: "owedstrike",
    name: "Owed strike",
    version: "1.0.0",
    description: "Stalls after a command returns, beside a display transform.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform", "ui.surface", "storage.kv"],
  });
}

test("a display call between a post-return stall and the next command leaves the strike owed to that command", {
  tags: ["slow"],
  timeout: 4 * OUTSIDE_STALL_ENDED_MS,
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const plugin = manifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(plugin, GUEST, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const pluginId = installed.outcome.id;
  const rpc = await root.internalCallerFor(root.ownerId);
  const command = (name: string): Promise<unknown> => rpc.plugin.invokeUiCommand({ pluginId, name, args: "{}", chatId: null });
  const crashes = async (): Promise<number> => (await capturePluginRows(root.db, root.ownerId, pluginId)).plugin.consecutiveCrashes;

  await command(STALL_AFTER);
  await sleep(OUTSIDE_STALL_ENDED_MS);

  // The display call is served by a fresh runtime and counts nothing.
  const display = await rpc.plugin.transformForDisplay({
    chatId: root.idSource.typeId(ID_PREFIX.chat),
    messageId: root.idSource.typeId(ID_PREFIX.message),
    text: "row",
  });
  expect(display.text).toBe(`row${MARK}`);
  expect(await crashes()).toBe(0);

  // The next command answers for the stall, once, and the one after it runs clean.
  await expect(command(PING)).toThrowTRPCError("BAD_REQUEST");
  expect(await crashes()).toBe(1);
  await command(PING);
  expect(await crashes()).toBe(0);
});
