// @subject packages/client/src/features/plugin/components/plugin-surface-shell.tsx
// A plugin panel's header names its plugin in full: the attribution line wraps instead of clipping the name behind the panel's controls.
import { spawn } from "node:child_process";
import { CHAT_PLUGINS_TAB_LABEL } from "@orb/client/lib";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { PluginHideFocusStory } from "./_hide-focus-stories.tsx";

const PLUGIN_NAME = "Pocket Arcade of Endless Wandering Wonders and Marvels Beyond";

test.use({ viewport: { width: 1600, height: 1000 } });

test("a long plugin name is not clipped in its panel header", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "long-name-panel",
    name: PLUGIN_NAME,
    description: "A panel whose name is longer than its header.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const source =
    'orb.host(1).ui.register({ id: "long", anchor: "chat-flank", title: "Arcade", tier: "static", spec: { kind: "text", value: "Panel content" } });';
  const installed = await caller.plugin.install({
    bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
    grant: manifest.capabilities,
  });
  await caller.plugin.setEnabled({ pluginId: installed.id, enabled: true });
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "docked" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "plugin.getSurfaceState",
      "settings.updateUserSettingsSection",
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  });
  await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
  await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
  const name = page
    .getByRole("group", { name: `${PLUGIN_NAME}: Arcade`, exact: true })
    .getByText(PLUGIN_NAME, { exact: true })
    .first();
  await expect(name).toBeVisible();
  const clipped = await name.evaluate((node) => node.scrollWidth > node.clientWidth);
  expect(clipped).toBe(false);
});
