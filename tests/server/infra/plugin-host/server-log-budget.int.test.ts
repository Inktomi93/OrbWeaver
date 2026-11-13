// Every server-log line a plugin's guest causes draws on one window of one drain's volume: its log lines, its failed
// host calls and its failed calls. Past the budget the server log drops them, the plugin's own log keeps its lines,
// and one line counts the drops when the window closes or the plugin is disabled.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/domain/plugin/activation/activate.ts
// @subject packages/server/src/domain/plugin/substrate/surface-state.ts

import { spawn } from "node:child_process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_LOG_LINES_MAX, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { z } from "zod";
import { PLUGIN_SERVER_LOG_WINDOW_MS } from "#server/infra/plugin-host/budgets.ts";

const PLUGIN_SLUG = "chattyrender";
const LOG_SCAN_LIMIT = 2000;
const THROW = "throw";
// Not a TypeID, so the card-state read fails past the bridge's own argument check.
const MALFORMED_CHARACTER_ID = "not-a-character-id";
const CROWD_COMMAND = "crowd";
const CAP_REFUSALS = 5;
// A stop for the loop well past any key cap, so a cap that never refuses ends the command instead of spinning.
const CROWD_KEY_LIMIT = 1000;
// The display transform reads `<tag>:<logs>:<fails>:<throw?>`: it logs `<tag> <i>` logs times, makes fails card-state
// reads that fail and swallows each, then throws when asked.
const GUEST = `const h = orb.host(1);
h.transforms.registerDisplay({ name: "chatty", apply: async ({ text }) => {
  const [tag, logs, fails, end] = text.split(":");
  for (let i = 0; i < Number(logs); i++) h.log.info(tag + " " + i);
  for (let i = 0; i < Number(fails); i++) {
    try { await h.character.getCardData(${JSON.stringify(MALFORMED_CHARACTER_ID)}); } catch {}
  }
  if (end === ${JSON.stringify(THROW)}) throw new Error(tag);
  return text;
} });
h.ui.registerCommand({ name: ${JSON.stringify(CROWD_COMMAND)}, describe: "Fill the surface state past its key cap", onRun: async () => {
  let refused = 0;
  for (let i = 0; refused < ${CAP_REFUSALS} && i < ${CROWD_KEY_LIMIT}; i++) {
    try { await h.ui.setState("surface_" + i, {}); } catch { refused += 1; }
  }
  h.log.info(String(refused));
} });`;

function manifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: PLUGIN_SLUG,
    name: "Chatty render",
    version: "1.0.0",
    description: "Logs and fails on every render.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform", "character.card_state", "ui.surface"],
  });
}

function lines(tag: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${tag} ${i}`);
}

const serverLogEntrySchema = z.looseObject({
  plugin: z.string().optional(),
  pluginSlug: z.string().optional(),
  operation: z.string().optional(),
  pluginId: typeIdSchema(ID_PREFIX.plugin).optional(),
  cap: z.number().optional(),
  msg: z.string().optional(),
  dropped: z.number().optional(),
});
type ServerLogEntry = z.infer<typeof serverLogEntrySchema>;
const ENTRY_KINDS = ["guest-line", "failed-host-call", "failed-call", "dropped-count"] as const;
type EntryKind = (typeof ENTRY_KINDS)[number];

function kindOf(entry: ServerLogEntry): EntryKind {
  if (entry.dropped !== undefined) {
    return "dropped-count";
  }
  if (entry.operation !== undefined) {
    return "failed-host-call";
  }
  return entry.pluginSlug === undefined ? "guest-line" : "failed-call";
}

interface Chatty {
  readonly pluginId: PluginId;
  /** Run the command that crowds the surface state, and return its log line. */
  readonly crowd: () => Promise<string | undefined>;
  /** Every server-log entry, oldest first. */
  readonly allEntries: () => ServerLogEntry[];
  readonly render: (tag: string, logs: number, fails?: number, end?: typeof THROW) => Promise<void>;
  /** This plugin's server-log entries, oldest first. */
  readonly serverLog: () => ServerLogEntry[];
  readonly counted: () => number[];
}

async function installChatty(root: ServerTestHarness): Promise<Chatty> {
  const owner = await root.principalFor(root.ownerId);
  const plugin = manifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(plugin, GUEST, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const rpc = await root.internalCallerFor(root.ownerId);
  const chatId = root.idSource.typeId(ID_PREFIX.chat);
  const messageId = root.idSource.typeId(ID_PREFIX.message);
  const allEntries = (): ServerLogEntry[] =>
    root.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => serverLogEntrySchema.parse(JSON.parse(line)))
      .reverse();
  const serverLog = (): ServerLogEntry[] => allEntries().filter((entry) => entry.plugin === PLUGIN_SLUG || entry.pluginSlug === PLUGIN_SLUG);
  const pluginId = installed.outcome.id;
  return {
    pluginId,
    crowd: async (): Promise<string | undefined> => {
      await rpc.plugin.invokeUiCommand({ pluginId, name: CROWD_COMMAND, args: "{}", chatId: null });
      return (await root.services.plugin.getLog({ caller: owner, pluginId })).at(-1)?.message;
    },
    allEntries,
    render: async (tag, logs, fails, end): Promise<void> => {
      await rpc.plugin.transformForDisplay({ chatId, messageId, text: [tag, logs, fails ?? 0, end ?? ""].join(":") });
    },
    serverLog,
    counted: () => serverLog().flatMap((entry) => (entry.dropped === undefined ? [] : [entry.dropped])),
  };
}

test("past its budget a display transform's lines leave the server log, and one line counts them", async () => {
  const underBudget = 3;
  const pastBudget = 5;
  const nextWindow = 2;
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: "info" });
  const chatty = await installChatty(root);
  const owner = await root.principalFor(root.ownerId);

  // Control: under the budget every line reaches the server log.
  await chatty.render("under", underBudget);
  expect(chatty.serverLog().map((entry) => entry.msg)).toEqual(lines("under", underBudget));

  await chatty.render("fill", PLUGIN_LOG_LINES_MAX - underBudget);
  await chatty.render("past", pastBudget);
  const budgeted = [...lines("under", underBudget), ...lines("fill", PLUGIN_LOG_LINES_MAX - underBudget)];
  expect(chatty.serverLog().map((entry) => entry.msg)).toEqual(budgeted);
  // The plugin's own log still holds the lines the server log dropped.
  const pluginLog = await root.services.plugin.getLog({ caller: owner, pluginId: chatty.pluginId });
  expect(pluginLog.slice(-pastBudget).map((line) => line.message)).toEqual(lines("past", pastBudget));
  expect(chatty.counted()).toEqual([]);

  // The window closes on its own, with no further line from the plugin, and counts what it dropped.
  root.timers.advance(PLUGIN_SERVER_LOG_WINDOW_MS);
  expect(chatty.serverLog().length).toBe(budgeted.length + 1);
  expect(chatty.counted()).toEqual([pastBudget]);

  // Control: the next window admits lines again.
  await chatty.render("next", nextWindow);
  expect(
    chatty
      .serverLog()
      .slice(-nextWindow)
      .map((entry) => entry.msg),
  ).toEqual(lines("next", nextWindow));
});

test("failed host calls and failed calls share the window, and disabling the plugin writes the count at once", async () => {
  const failsUnder = 2;
  const failsPast = 3;
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: "info" });
  const chatty = await installChatty(root);
  const owner = await root.principalFor(root.ownerId);

  // Control: under the budget each failed host call and the failed call write their line.
  await chatty.render("under", 0, failsUnder, THROW);
  const underLines: EntryKind[] = [...Array.from({ length: failsUnder }, (): EntryKind => "failed-host-call"), "failed-call"];
  expect(chatty.serverLog().map(kindOf)).toEqual(underLines);

  // The clock stands still, so the timer that closes a dropping window asks for exactly one window.
  const windowTimers = (): number => root.timers.armed().filter((ms) => ms === PLUGIN_SERVER_LOG_WINDOW_MS).length;
  const otherWindowTimers = windowTimers();
  await chatty.render("fill", PLUGIN_LOG_LINES_MAX - underLines.length);
  await chatty.render("past", 0, failsPast, THROW);
  const budgeted: EntryKind[] = [...underLines, ...Array.from({ length: PLUGIN_LOG_LINES_MAX - underLines.length }, (): EntryKind => "guest-line")];
  expect(chatty.serverLog().map(kindOf)).toEqual(budgeted);
  expect(windowTimers()).toBe(otherWindowTimers + 1);

  // Disabling the plugin writes the count now and cancels the timer that would write it again. (Advancing the clock
  // here would also fire the disposed runtime's retirement backstop before the broker answers it.)
  await root.services.plugin.setEnabled({ caller: owner, pluginId: chatty.pluginId, enabled: false });
  expect(chatty.serverLog().map(kindOf)).toEqual([...budgeted, "dropped-count"]);
  expect(chatty.counted()).toEqual([failsPast + 1]);
  expect(windowTimers()).toBe(otherWindowTimers);
});

test("a plugin held at its surface-state key cap writes the refusal to the server log once", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: "info" });
  const chatty = await installChatty(root);
  const capLines = (): ServerLogEntry[] => chatty.allEntries().filter((entry) => entry.pluginId === chatty.pluginId && entry.cap !== undefined);

  // Control: the guest was refused each time it reached past the cap.
  expect(await chatty.crowd()).toBe(String(CAP_REFUSALS));
  expect(capLines()).toHaveLength(1);
  expect(await chatty.crowd()).toBe(String(CAP_REFUSALS));
  expect(capLines()).toHaveLength(1);
});
