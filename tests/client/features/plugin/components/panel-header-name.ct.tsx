// @subject packages/client/src/features/plugin/components/plugin-surface-shell.tsx
// A plugin panel's header names its plugin and its surface in full: the attribution line and the surface title wrap instead of clipping behind the panel's controls.
import { spawn } from "node:child_process";
import { CHAT_PLUGINS_TAB_LABEL } from "@orb/client/lib";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { accessibilityScan, seedShellState, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { pluginSurfaceName } from "#client/features/plugin/lib/plugin-panel-copy.ts";
import type { PluginHideFocusStory } from "./_hide-focus-stories.tsx";

const STORY = "tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory";
const PLUGIN_NAME = "Pocket Arcade of Endless Wandering Wonders and Marvels Beyond";
const SHORT_TITLE = "Arcade";
const LONG_TITLE = "Two thousand forty-eight tiles slid across the board until a single square holds the whole sum";
const TEXT_200 = 2;

test.use({ viewport: { width: 1600, height: 1000 } });

/** Install and enable a plugin with one chat-flank surface titled `title`, serve the room's reads, and return the room to mount. */
async function installPluginPanel(root: ServerTestHarness, corpus: CorpusPlayback, page: Page, title: string): Promise<ChatId> {
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
  const source = `orb.host(1).ui.register({ id: "long", anchor: "chat-flank", title: ${JSON.stringify(title)}, tier: "static", spec: { kind: "text", value: "Panel content" } });`;
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
  return room.id;
}

test("a long plugin name is not clipped in its panel header", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const chatId = await installPluginPanel(root, corpus, page, SHORT_TITLE);
  await mount<typeof PluginHideFocusStory>(STORY, { chatId });
  await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
  const name = page
    .getByRole("group", { name: pluginSurfaceName(PLUGIN_NAME, SHORT_TITLE), exact: true })
    .getByText(PLUGIN_NAME, { exact: true })
    .first();
  await expect(name).toBeVisible();
  const clipped = await name.evaluate((node) => node.scrollWidth > node.clientWidth);
  expect(clipped).toBe(false);
  // The header's name is `<plugin>: <title>`; axe reads the visible name and title as two words, not one welded token.
  const result = await accessibilityScan(page);
  const mismatched = result.violations.find(({ id }) => id === "label-content-name-mismatch")?.nodes ?? [];
  expect(mismatched.filter(({ html }) => html.includes('data-slot="collapsible-trigger"'))).toEqual([]);
});

for (const scale of [1, TEXT_200]) {
  test(`a surface title longer than the header wraps whole at ${scale * 100}% text`, async ({ corpus, page, mount }) => {
    await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
    const chatId = await installPluginPanel(root, corpus, page, LONG_TITLE);
    await mount<typeof PluginHideFocusStory>(STORY, { chatId });
    await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
    await setRootFontScale(page, channelName("fontScale"), scale);
    const title = page.getByRole("group", { name: pluginSurfaceName(PLUGIN_NAME, LONG_TITLE), exact: true }).getByText(LONG_TITLE, { exact: true });
    await expect(title).toBeVisible();
    const shown = await title.evaluate((node) => ({
      whole: node.scrollWidth <= node.clientWidth,
      overflow: getComputedStyle(node).textOverflow,
      lines: Math.round(node.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(node).lineHeight)),
    }));
    expect(shown.whole).toBe(true);
    expect(shown.overflow).not.toBe("ellipsis");
    expect(shown.lines).toBeGreaterThan(1);
  });
}
