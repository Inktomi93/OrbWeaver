// A server guest reads a failed host call by its name and message. A named refusal keeps both. Any other failure, a
// database fault among them, reaches the guest as one fixed sentence, so the failed query's SQL and bound values stay
// in the server.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts

import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_CALL_FAILED, PLUGIN_HOST_VERSIONS, PLUGIN_KV_KEY_MAX_CHARS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { pluginKv } from "@orb/db";
import type { PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant, withheldTable } from "@orb/testkit/node/composed";
import { getTableName } from "drizzle-orm";

const READ = "read";
const OVERSIZED = "oversized";
const READ_OK = "read ok";
const LEDGER_KEY = "ledger";
// Each command logs what its host call answered: the success line, or the rejection's name and message.
const GUEST = `const h = orb.host(1);
const report = async (call, ok) => { try { await call(); h.log.info(ok); } catch (e) { h.log.info(e.name + ": " + e.message); } };
h.ui.registerCommand({ name: ${JSON.stringify(READ)}, describe: "Read the ledger", onRun: () => report(() => h.storage.get(${JSON.stringify(LEDGER_KEY)}), ${JSON.stringify(READ_OK)}) });
h.ui.registerCommand({ name: ${JSON.stringify(OVERSIZED)}, describe: "Write an oversized key", onRun: () => report(() => h.storage.set(${JSON.stringify("k".repeat(PLUGIN_KV_KEY_MAX_CHARS + 1))}, "v"), "written") });`;
const FAULT_LINE = `Error: ${PLUGIN_HOST_CALL_FAILED}`;

function manifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: "faultreader",
    name: "Fault reader",
    version: "1.0.0",
    description: "Logs what each storage call answered.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["storage.kv", "ui.surface"],
  });
}

/** Run one command and return the line its guest logged for it. */
async function runLogged(root: ServerTestHarness, pluginId: PluginId, name: string): Promise<string | undefined> {
  const owner = await root.principalFor(root.ownerId);
  const before = (await root.services.plugin.getLog({ caller: owner, pluginId })).length;
  await (await root.internalCallerFor(root.ownerId)).plugin.invokeUiCommand({ pluginId, name, args: "{}", chatId: null });
  const lines = await root.services.plugin.getLog({ caller: owner, pluginId });
  return lines.slice(before).at(-1)?.message;
}

test("a database fault in a bridge operation reaches the guest as the fixed sentence, and a named refusal keeps its text", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const owner = await root.principalFor(root.ownerId);
  const plugin = manifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(plugin, GUEST, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const pluginId = installed.outcome.id;

  // Controls: the read works, and the storage refusal of an oversized key reaches the guest under its own name and text.
  expect(await runLogged(root, pluginId, READ)).toBe(READ_OK);
  const refusal = await runLogged(root, pluginId, OVERSIZED);
  expect(refusal).toEqual(expect.stringContaining(String(PLUGIN_KV_KEY_MAX_CHARS)));
  expect(refusal).not.toBe(FAULT_LINE);

  await using _fault = await withheldTable(root.db, pluginKv);
  expect(await runLogged(root, pluginId, READ)).toBe(FAULT_LINE);
  const guestLog = (await root.services.plugin.getLog({ caller: owner, pluginId })).map(({ message }) => message);
  expect(guestLog.filter((message) => message.includes(getTableName(pluginKv)))).toEqual([]);
});
