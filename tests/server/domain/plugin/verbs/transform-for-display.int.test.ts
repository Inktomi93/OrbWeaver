// A display transform is a query, so it writes no plugin state: a clean run does not reset the crash count a write
// path built, and a throwing run neither counts a crash nor records an error. A write path still counts, and its
// crashes still disable the plugin at the threshold.
// @subject packages/server/src/domain/plugin/verbs/transform-for-display.ts
// @subject packages/server/src/domain/plugin/activation/activate.ts

import { spawn } from "node:child_process";
import type { PluginManifest, PluginStatus } from "@orb/contracts/plugin";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { LogLevel } from "@orb/contracts/settings";
import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { PLUGIN_CRASH_DISABLE_THRESHOLD } from "#server/domain/plugin/index.ts";

const ENABLED = "enabled" satisfies PluginStatus;
const ERRORED = "errored" satisfies PluginStatus;
const FAIL_COMMAND = "fail";
const THROW_TEXT = "throw on this text";
const MARK = " [seen]";
const GUEST = `const h = orb.host(1);
h.transforms.registerDisplay({ name: "mark", apply: ({ text }) => {
  if (text === ${JSON.stringify(THROW_TEXT)}) throw new Error("display refusal");
  return text + ${JSON.stringify(MARK)};
}});
h.ui.registerCommand({ name: ${JSON.stringify(FAIL_COMMAND)}, describe: "Fail on purpose", onRun: () => { throw new Error("write path failure"); } });`;
const LOG_SCAN_LIMIT = 500;
const FAILURE_LINE = "plugin: failure";
// A failed single call logs at warn.
const FAILURE_LEVEL = "warn" satisfies LogLevel;

function manifest(): PluginManifest {
  return pluginManifestSchema.parse({
    id: "markdisplay",
    name: "Mark display",
    version: "1.0.0",
    description: "A display transform beside a command that always fails.",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["chat.transform", "ui.surface"],
  });
}

interface Installed {
  readonly pluginId: PluginId;
  readonly display: (text: string) => Promise<string>;
  readonly fail: () => Promise<void>;
  readonly state: () => Promise<PluginState>;
}

/** What the owner's plugin page shows of one plugin's health. */
interface PluginState {
  readonly status: PluginStatus | undefined;
  readonly lastError: string | null | undefined;
}

async function installMarkGuest(root: ServerTestHarness): Promise<Installed> {
  const owner = await root.principalFor(root.ownerId);
  const plugin = manifest();
  const installed = await seedInstalledPlugin(root, { caller: owner, bundle: makePluginBundle(plugin, GUEST, root.clock.now()), grant: [] });
  await seedPluginGrant(root, { caller: owner, pluginId: installed.outcome.id, grant: plugin.capabilities, acknowledgedNetHosts: [], enable: true });
  const pluginId = installed.outcome.id;
  const rpc = await root.internalCallerFor(root.ownerId);
  const chatId = root.idSource.typeId(ID_PREFIX.chat);
  const messageId = root.idSource.typeId(ID_PREFIX.message);
  return {
    pluginId,
    display: async (text): Promise<string> => (await rpc.plugin.transformForDisplay({ chatId, messageId, text })).text,
    fail: async (): Promise<void> => {
      await expect(rpc.plugin.invokeUiCommand({ pluginId, name: FAIL_COMMAND, args: "{}", chatId: null })).toThrowTRPCError("BAD_REQUEST");
    },
    state: async (): Promise<PluginState> => {
      const row = (await rpc.plugin.list()).find((candidate) => candidate.id === pluginId);
      return { status: row?.status, lastError: row?.lastError };
    },
  };
}

test("a clean display transform does not reset the crash count, so the write path's next crash still disables the plugin", {
  tags: ["slow"],
}, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn });
  const guest = await installMarkGuest(root);

  for (let crash = 1; crash < PLUGIN_CRASH_DISABLE_THRESHOLD; crash += 1) {
    await guest.fail();
  }
  expect((await guest.state()).status).toBe(ENABLED);
  expect(await guest.display("row text")).toBe(`row text${MARK}`);

  await guest.fail();
  expect(await guest.state()).toEqual({ status: ERRORED, lastError: expect.any(String) });
});

test("a throwing display transform counts no crash and records no error, however often it runs", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: FAILURE_LEVEL });
  const guest = await installMarkGuest(root);
  const failuresLogged = (): number => root.observability.logLines(LOG_SCAN_LIMIT).filter((line) => line.includes(FAILURE_LINE)).length;

  for (let run = 0; run < PLUGIN_CRASH_DISABLE_THRESHOLD; run += 1) {
    expect(await guest.display(THROW_TEXT)).toBe(THROW_TEXT);
  }
  // Control: each throw reached the guest and was logged, and the plugin is still resident and still transforms.
  expect(failuresLogged()).toBe(PLUGIN_CRASH_DISABLE_THRESHOLD);
  expect(await guest.display("row text")).toBe(`row text${MARK}`);
  expect(await guest.state()).toEqual({ status: ENABLED, lastError: null });
});
