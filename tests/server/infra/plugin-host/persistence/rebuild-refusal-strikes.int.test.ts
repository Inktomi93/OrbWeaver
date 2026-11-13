// A sleeping plugin whose rebuild is refused by the host is not the plugin's crash: when its installer is disabled while
// its main.js reads, a flood of refusals ends the rebuild uncaught, the call that woke it fails as a refusal, and its
// crash count stays still. A guest's own throw still counts, even one dressed as a host refusal: only the app records a refusal, where it
// raises one. The crash count is read from the plugin's row, which no door shows.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/domain/plugin/activation/activate.ts

import { spawn } from "node:child_process";
import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability, PluginManifest, PluginStatus } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, freshHeldDb, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { capturePluginRows } from "@orb/testkit/node/rows";
import { afterAll, beforeAll } from "vitest";
import { PLUGIN_HOST_UNAVAILABLE } from "#server/infra/plugin-host/process-protocol.ts";

const ENABLED = "enabled" satisfies PluginStatus;
const NOTE = "note";
const CRASH = "crash";
// The guest's own throw, dressed in a host refusal's name and an installer refusal's words.
const CRASH_MESSAGE = "plugin host: this plugin's installer is disabled";
const CAPABILITIES = ["ui.surface", "storage.kv", "global_vars"] as const satisfies readonly PluginCapability[];
const REFUSED_BURST = 8;
// main.js registers its commands, then reads its own storage and fires a burst of reads on the installer's account,
// rethrowing the first refusal uncaught, so a rebuild of a sleeping runtime fails if its installer is disabled.
const SLEEPER_SOURCE = `const h = orb.host(1);
h.ui.registerCommand({ name: ${JSON.stringify(NOTE)}, describe: "Note a line", onRun: () => { h.log.info("noted"); } });
h.ui.registerCommand({ name: ${JSON.stringify(CRASH)}, describe: "Crash", onRun: () => {
  const dressed = new Error(${JSON.stringify(CRASH_MESSAGE)});
  dressed.name = ${JSON.stringify(PLUGIN_HOST_UNAVAILABLE)};
  throw dressed;
} });
(async () => {
  await h.storage.get("first");
  const burst = await Promise.allSettled(Array.from({ length: ${String(REFUSED_BURST)} }, (_, i) => h.variables.get("v" + i)));
  const refused = burst.find((settled) => settled.status === "rejected");
  if (refused !== undefined) throw refused.reason;
})();`;
const NEIGHBOUR_SOURCE = `orb.host(1).ui.registerCommand({ name: ${JSON.stringify(NOTE)}, describe: "Note a line", onRun: () => {} });`;
// The sleeper's own storage read in main.js, which its rebuild makes before the read on the installer's account.
const SLEEPER_STORAGE_READ = /from "plugin_kv"/u;

function manifest(id: string, capabilities: readonly PluginCapability[]): PluginManifest {
  return pluginManifestSchema.parse({
    id,
    name: `Rebuild ${id}`,
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    description: "Reads on every rebuild.",
    capabilities,
  });
}

let held: Awaited<ReturnType<typeof freshHeldDb>>;
let root: ServerTestHarness;
let lifetime: AsyncDisposableStack;
let member: Principal;
let sleeper: PluginId;

// The root, its broker and both installs are the case's setup; the case pays only for its rebuilds.
beforeAll(async () => {
  await using construction = new AsyncDisposableStack();
  held = construction.use(await freshHeldDb());
  // One worker holds one runtime, so the neighbour's activation puts the sleeper to sleep.
  root = construction.use(await createServerHarness({ pluginSpawn: spawn, db: held.db, env: { ["PLUGIN_BROKER_WORKER_MAX"]: "1" } }));
  member = await root.principalFor((await root.actor()).id);
  const install = async (plugin: PluginManifest, source: string): Promise<PluginId> => {
    const installed = await seedInstalledPlugin(root, { caller: member, bundle: makePluginBundle(plugin, source, root.clock.now()), grant: [] });
    await seedPluginGrant(root, { caller: member, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
    return installed.outcome.id;
  };
  sleeper = await install(manifest("rebuild-sleeper", CAPABILITIES), SLEEPER_SOURCE);
  await install(manifest("rebuild-neighbour", ["ui.surface"]), NEIGHBOUR_SOURCE);
  lifetime = construction.move();
});

afterAll(async () => {
  await lifetime.disposeAsync();
});

test("a sleeping plugin whose rebuild the host refuses is never struck, and its own throw still counts", async () => {
  const owner = await root.principalFor(root.ownerId);
  const rpc = await root.internalCallerFor(member.userId);
  const run = (name: string): Promise<unknown> => rpc.plugin.invokeUiCommand({ pluginId: sleeper, name, args: "{}", chatId: null });
  const setMemberEnabled = (enabled: boolean): Promise<unknown> => root.services.admin.setEnabled({ principal: owner, userId: member.userId, enabled });
  const view = async (): Promise<{ readonly status: PluginStatus | undefined; readonly crashes: number }> => {
    const listed = (await root.services.plugin.list({ caller: member })).find(({ id }) => id === sleeper);
    const { plugin } = await capturePluginRows(root.db, member.userId, sleeper);
    return { status: listed?.status, crashes: plugin.consecutiveCrashes };
  };

  // The sleeper's rebuild is parked on its storage read when its installer is disabled, so every read in its burst on
  // the installer's account is refused and the rebuild fails uncaught.
  const rebuildRead = held.hold(SLEEPER_STORAGE_READ);
  const calling = run(NOTE).then(
    () => null,
    (error: unknown) => error,
  );
  await rebuildRead.reached;
  rebuildRead.disarm();
  await setMemberEnabled(false);
  rebuildRead.release();
  expect(await calling).toBeInstanceOf(Error);
  expect(await view()).toEqual({ status: ENABLED, crashes: 0 });

  // Control: with its installer enabled the sleeper wakes, and its own throw counts though it reads as a host refusal.
  await setMemberEnabled(true);
  await expect(run(CRASH)).rejects.toThrow(CRASH_MESSAGE);
  await expect.poll(async () => (await view()).crashes).toBe(1);
  expect((await view()).status).toBe(ENABLED);
});
