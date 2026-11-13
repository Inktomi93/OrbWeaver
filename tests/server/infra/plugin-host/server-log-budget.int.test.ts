// A plugin's log lines reach the shared server log only up to one drain's volume per window: past it the server log
// drops them, the plugin's own log keeps them, and when the window closes one line counts the drops.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts

import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_LOG_LINES_MAX, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { z } from "zod";
import { PLUGIN_SERVER_LOG_WINDOW_MS } from "#server/infra/plugin-host/budgets.ts";

const PLUGIN_SLUG = "chattyrender";
const LOG_SCAN_LIMIT = 2000;
const UNDER_BUDGET = 3;
const PAST_BUDGET = 5;
const NEXT_WINDOW = 2;
// The display transform reads `<tag>:<count>` and logs `<tag> <i>` count times.
const GUEST = `const h = orb.host(1);
h.transforms.registerDisplay({ name: "chatty", apply: ({ text }) => {
  const [tag, count] = text.split(":");
  for (let i = 0; i < Number(count); i++) h.log.info(tag + " " + i);
  return text;
} });`;

function manifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: PLUGIN_SLUG,
    name: "Chatty render",
    version: "1.0.0",
    description: "Logs on every render.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform"],
  });
}

function lines(tag: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${tag} ${i}`);
}

const serverLogEntrySchema = z.looseObject({ plugin: z.string().optional(), msg: z.string().optional(), dropped: z.number().optional() });
type ServerLogEntry = z.infer<typeof serverLogEntrySchema>;

test("past its budget a display transform's lines leave the server log, and one line counts them", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: "info" });
  const owner = await root.principalFor(root.ownerId);
  const plugin = manifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(plugin, GUEST, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const rpc = await root.internalCallerFor(root.ownerId);
  const chatId = root.idSource.typeId(ID_PREFIX.chat);
  const messageId = root.idSource.typeId(ID_PREFIX.message);
  const render = async (tag: string, count: number): Promise<void> => {
    await rpc.plugin.transformForDisplay({ chatId, messageId, text: `${tag}:${count}` });
  };
  // Oldest first, only this plugin's lines.
  const serverLog = (): ServerLogEntry[] =>
    root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => serverLogEntrySchema.parse(JSON.parse(line)))
      .filter((entry) => entry.plugin === PLUGIN_SLUG)
      .reverse();
  const counted = (): number[] => serverLog().flatMap((entry) => (entry.dropped === undefined ? [] : [entry.dropped]));

  // Control: under the budget every line reaches the server log.
  await render("under", UNDER_BUDGET);
  expect(serverLog().map((entry) => entry.msg)).toEqual(lines("under", UNDER_BUDGET));

  await render("fill", PLUGIN_LOG_LINES_MAX - UNDER_BUDGET);
  await render("past", PAST_BUDGET);
  const budgeted = [...lines("under", UNDER_BUDGET), ...lines("fill", PLUGIN_LOG_LINES_MAX - UNDER_BUDGET)];
  expect(serverLog().map((entry) => entry.msg)).toEqual(budgeted);
  // The plugin's own log still holds the lines the server log dropped.
  const pluginLog = await root.services.plugin.getLog({ caller: owner, pluginId: installed.outcome.id });
  expect(pluginLog.slice(-PAST_BUDGET).map((line) => line.message)).toEqual(lines("past", PAST_BUDGET));
  expect(counted()).toEqual([]);

  // The window closes on its own, with no further line from the plugin, and counts what it dropped.
  root.timers.advance(PLUGIN_SERVER_LOG_WINDOW_MS);
  expect(serverLog().length).toBe(budgeted.length + 1);
  expect(counted()).toEqual([PAST_BUDGET]);

  // Control: the next window admits lines again.
  await render("next", NEXT_WINDOW);
  expect(
    serverLog()
      .slice(-NEXT_WINDOW)
      .map((entry) => entry.msg),
  ).toEqual(lines("next", NEXT_WINDOW));
});
