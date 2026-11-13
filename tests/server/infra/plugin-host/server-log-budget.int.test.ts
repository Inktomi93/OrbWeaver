// Every server-log line a plugin's guest causes draws on one window: its log lines and its failed calls share one
// drain's volume, and host faults on its bridge calls have a small share of their own. Past a share the server log drops
// the line, the plugin's own log keeps its lines, and one line counts the drops when the window closes or the plugin is
// disabled. The cases share one root and one broker; each owns a plugin of its own, so each owns its own window.
// @subject packages/server/src/infra/plugin-host/process-runtime.ts
// @subject packages/server/src/domain/plugin/activation/activate.ts
// @subject packages/server/src/domain/plugin/substrate/surface-state.ts

import { spawn } from "node:child_process";
import type { PluginLogView, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_LOG_LINES_MAX, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { afterAll, beforeAll } from "vitest";
import { z } from "zod";
import { PLUGIN_COMMAND_TIMEOUT_MS, PLUGIN_SERVER_LOG_FAULT_LINES, PLUGIN_SERVER_LOG_WINDOW_MS } from "#server/infra/plugin-host/budgets.ts";

const LOG_SCAN_LIMIT = 2000;
const THROW = "throw";
// Not a TypeID, so the card-state read fails past the bridge's own argument check.
const MALFORMED_CHARACTER_ID = "not-a-character-id";
const CROWD_COMMAND = "crowd";
const CAP_REFUSALS = 5;
// A stop for the loop well past any key cap, so a cap that never refuses ends the command instead of spinning.
const CROWD_KEY_LIMIT = 1000;
// Every enabled plugin's display transform sees every render, so a render names the plugin it is for. The transform
// reads `<slug>:<tag>:<logs>:<fails>:<throw?>`: it logs `<tag> <i>` logs times, makes fails card-state reads that fail
// and swallows each, then throws when asked.
function guest(slug: string): string {
  return `const h = orb.host(1);
h.transforms.registerDisplay({ name: "chatty", apply: async ({ text }) => {
  const [target, tag, logs, fails, end] = text.split(":");
  if (target !== ${JSON.stringify(slug)}) return text;
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
}

function manifest(slug: string): PluginManifest {
  return pluginManifestSchema.parse({
    id: slug,
    name: `Chatty ${slug}`,
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
  level: z.string().optional(),
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
  /** Run one of the guest's commands, and return its plugin log. */
  readonly command: (name: string) => Promise<readonly PluginLogView[]>;
  /** Every server-log entry, oldest first. */
  readonly allEntries: () => ServerLogEntry[];
  readonly render: (tag: string, logs: number, fails?: number, end?: typeof THROW) => Promise<void>;
  /** This plugin's server-log entries, oldest first. */
  readonly serverLog: () => ServerLogEntry[];
  readonly counted: () => number[];
}

async function installChatty(harness: ServerTestHarness, slug: string): Promise<Chatty> {
  const owner = await harness.principalFor(harness.ownerId);
  const plugin = manifest(slug);
  const installed = await seedInstalledPlugin(harness, { caller: owner, bundle: makePluginBundle(plugin, guest(slug), harness.clock.now()), grant: [] });
  await seedPluginGrant(harness, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const rpc = await harness.internalCallerFor(harness.ownerId);
  const chatId = harness.idSource.typeId(ID_PREFIX.chat);
  const messageId = harness.idSource.typeId(ID_PREFIX.message);
  const allEntries = (): ServerLogEntry[] =>
    harness.observability
      .logLines(LOG_SCAN_LIMIT)
      .map((line) => serverLogEntrySchema.parse(JSON.parse(line)))
      .reverse();
  const serverLog = (): ServerLogEntry[] => allEntries().filter((entry) => entry.plugin === slug || entry.pluginSlug === slug);
  const pluginId = installed.outcome.id;
  return {
    pluginId,
    command: async (name): Promise<readonly PluginLogView[]> => {
      await rpc.plugin.invokeUiCommand({ pluginId, name, args: "{}", chatId: null });
      return await harness.services.plugin.getLog({ caller: owner, pluginId });
    },
    allEntries,
    render: async (tag, logs, fails, end): Promise<void> => {
      await rpc.plugin.transformForDisplay({ chatId, messageId, text: [slug, tag, logs, fails ?? 0, end ?? ""].join(":") });
    },
    serverLog,
    counted: () => serverLog().flatMap((entry) => (entry.dropped === undefined ? [] : [entry.dropped])),
  };
}

const SLUGS = { lines: "chattylines", failures: "chattyfailures", cap: "chattycap", faults: "chattyfaults" } as const;
let root: ServerTestHarness;
let chatty: Readonly<Record<keyof typeof SLUGS, Chatty>>;

// The broker starts with the first activation, so every case's plugin is installed here and no case pays for it.
beforeAll(async () => {
  root = await createServerHarness({ pluginSpawn: spawn, logLevel: "info" });
  chatty = {
    lines: await installChatty(root, SLUGS.lines),
    failures: await installChatty(root, SLUGS.failures),
    cap: await installChatty(root, SLUGS.cap),
    faults: await installChatty(root, SLUGS.faults),
  };
});

afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

test("past its budget a display transform's lines leave the server log, and one line counts them", async () => {
  const underBudget = 3;
  const pastBudget = 5;
  const nextWindow = 2;
  const owner = await root.principalFor(root.ownerId);
  const { lines: plugin } = chatty;

  // Control: under the budget every line reaches the server log.
  await plugin.render("under", underBudget);
  expect(plugin.serverLog().map((entry) => entry.msg)).toEqual(lines("under", underBudget));

  await plugin.render("fill", PLUGIN_LOG_LINES_MAX - underBudget);
  await plugin.render("past", pastBudget);
  const budgeted = [...lines("under", underBudget), ...lines("fill", PLUGIN_LOG_LINES_MAX - underBudget)];
  expect(plugin.serverLog().map((entry) => entry.msg)).toEqual(budgeted);
  // The plugin's own log still holds the lines the server log dropped.
  const pluginLog = await root.services.plugin.getLog({ caller: owner, pluginId: plugin.pluginId });
  expect(pluginLog.slice(-pastBudget).map((line) => line.message)).toEqual(lines("past", pastBudget));
  expect(plugin.counted()).toEqual([]);

  // The window closes on its own, with no further line from the plugin, and counts what it dropped.
  root.timers.advance(PLUGIN_SERVER_LOG_WINDOW_MS);
  expect(plugin.serverLog().length).toBe(budgeted.length + 1);
  expect(plugin.counted()).toEqual([pastBudget]);

  // Control: the next window admits lines again.
  await plugin.render("next", nextWindow);
  expect(
    plugin
      .serverLog()
      .slice(-nextWindow)
      .map((entry) => entry.msg),
  ).toEqual(lines("next", nextWindow));
});

test("a failed call shares the guest's window, and disabling the plugin writes the count at once", async () => {
  const failsUnder = 2;
  const failsPast = 3;
  const owner = await root.principalFor(root.ownerId);
  const { failures: plugin } = chatty;

  // Control: under the budget each failed host call and the failed call write their line.
  await plugin.render("under", 0, failsUnder, THROW);
  const underLines: EntryKind[] = [...Array.from({ length: failsUnder }, (): EntryKind => "failed-host-call"), "failed-call"];
  expect(plugin.serverLog().map(kindOf)).toEqual(underLines);

  // The clock stands still, so the timer that closes a dropping window asks for exactly one window.
  const windowTimers = (): number => root.timers.armed().filter((ms) => ms === PLUGIN_SERVER_LOG_WINDOW_MS).length;
  const otherWindowTimers = windowTimers();
  // The failed call took one line of the guest's share; the fill takes the rest.
  await plugin.render("fill", PLUGIN_LOG_LINES_MAX - 1);
  await plugin.render("past", 0, failsPast, THROW);
  // Past the guest's share the failed call is dropped; the host faults land on their own share.
  const budgeted: EntryKind[] = [
    ...underLines,
    ...Array.from({ length: PLUGIN_LOG_LINES_MAX - 1 }, (): EntryKind => "guest-line"),
    ...Array.from({ length: failsPast }, (): EntryKind => "failed-host-call"),
  ];
  expect(plugin.serverLog().map(kindOf)).toEqual(budgeted);
  expect(windowTimers()).toBe(otherWindowTimers + 1);

  // Disabling the plugin writes the count now and cancels the timer that would write it again.
  await root.services.plugin.setEnabled({ caller: owner, pluginId: plugin.pluginId, enabled: false });
  expect(plugin.serverLog().map(kindOf)).toEqual([...budgeted, "dropped-count"]);
  expect(plugin.counted()).toEqual([1]);
  expect(windowTimers()).toBe(otherWindowTimers);
  // The disposed runtime's retirement settles, so a later case's clock advance cannot fire its backstop.
  await expect.poll(() => root.timers.armed().includes(PLUGIN_COMMAND_TIMEOUT_MS.dispose)).toBe(false);
});

test("a plugin held at its surface-state key cap writes the refusal to the server log once", async () => {
  const { cap: plugin } = chatty;
  const capLines = (): ServerLogEntry[] => plugin.allEntries().filter((entry) => entry.pluginId === plugin.pluginId && entry.cap !== undefined);

  // Control: the guest was refused each time it reached past the cap.
  expect((await plugin.command(CROWD_COMMAND)).at(-1)?.message).toBe(String(CAP_REFUSALS));
  expect(capLines()).toHaveLength(1);
  expect((await plugin.command(CROWD_COMMAND)).at(-1)?.message).toBe(String(CAP_REFUSALS));
  expect(capLines()).toHaveLength(1);
});

test("a guest that fills its window still leaves its host faults in the server log, up to their own share", async () => {
  const { faults: plugin } = chatty;
  // A render makes a few failing reads so it stays well inside one display call's deadline.
  const failsPerRender = 4;
  const renders = Math.ceil((PLUGIN_SERVER_LOG_FAULT_LINES + 1) / failsPerRender);
  const faultLines = (): number => plugin.serverLog().filter((entry) => kindOf(entry) === "failed-host-call").length;

  await plugin.render("fill", PLUGIN_LOG_LINES_MAX);
  expect(plugin.serverLog().map(kindOf)).toEqual(Array.from({ length: PLUGIN_LOG_LINES_MAX }, (): EntryKind => "guest-line"));
  // The guest's share is full: its next line is dropped, while host faults still land on their own share.
  await plugin.render("past", 1, failsPerRender);
  expect(faultLines()).toBe(failsPerRender);
  for (let render = 1; render < renders; render += 1) {
    await plugin.render("past", 0, failsPerRender);
  }
  // The fault share is bounded too: a guest that provokes faults gets no second channel past it.
  expect(faultLines()).toBe(PLUGIN_SERVER_LOG_FAULT_LINES);
  root.timers.advance(PLUGIN_SERVER_LOG_WINDOW_MS);
  expect(plugin.counted()).toEqual([1 + renders * failsPerRender - PLUGIN_SERVER_LOG_FAULT_LINES]);
});
