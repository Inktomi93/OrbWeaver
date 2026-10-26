import { spawn } from "node:child_process";
import { CHAT_PLUGINS_TAB_LABEL } from "@orb/client/lib";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema } from "@orb/contracts/plugin";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, ROOM_PROCEDURES, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHAT_PANEL_HIDE_LABEL, PLUGIN_PANELS_SHEET_LABEL, showInChatLabel } from "#client/features/plugin/lib/plugin-copy.ts";
import {
  CHAT_PLUGINS_EMPTY_TITLE,
  CHAT_PLUGINS_MANAGE_LABEL,
  CHAT_PLUGINS_OPEN_LABEL,
  movePluginPanelLabel,
} from "#client/features/plugin/lib/plugin-panel-copy.ts";
import type { PluginHideFocusStory } from "./_hide-focus-stories.tsx";

test.use({ viewport: { width: 1600, height: 1000 } });

type PanelRoot = Awaited<ReturnType<typeof createCorpusHarness>>;
type PanelCaller = Awaited<ReturnType<PanelRoot["internalCallerFor"]>>;

interface PreparedPanels {
  readonly caller: PanelCaller;
  readonly room: Awaited<ReturnType<PanelCaller["chat"]["listChats"]>>["items"][number];
  readonly installed: Awaited<ReturnType<PanelCaller["plugin"]["install"]>> | null;
  readonly routes: Awaited<ReturnType<typeof routeTrpc>>;
}

async function preparePanels(root: PanelRoot, page: Page, corpus: Parameters<typeof createShellAmbientReads>[0], register = true): Promise<PreparedPanels> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await caller.settings.updateUserSettingsSection({ section: "profile", patch: DEFAULT_USER_SETTINGS.profile });
  const manifest = pluginManifestSchema.parse({
    id: "context-panels",
    name: "Context witness",
    description: "Synthetic panels for Context composition.",
    version: "1.0.0",
    hostVersion: PLUGIN_HOST_VERSIONS[0],
    entry: PLUGIN_MAIN_ENTRY,
    capabilities: ["ui.surface"],
  });
  const source = ["First", "Second"]
    .map(
      (title) =>
        `orb.host(1).ui.register({ id: "${title.toLowerCase()}", anchor: "chat-flank", title: "${title}", tier: "static", spec: { kind: "stack", children: [{kind: "text", value: "${title} panel content"}, {kind: "textField", name: "note", label: "${title} panel note"}] } });`,
    )
    .join("\n");
  const installed = register
    ? await caller.plugin.install({
        bundleBase64: Buffer.from(makePluginBundle(manifest, source, root.clock.now())).toString("base64"),
        grant: manifest.capabilities,
      })
    : null;
  if (installed !== null) {
    await caller.plugin.setEnabled({ pluginId: installed.id, enabled: true });
  }
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus has no room");
  }
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "docked" } } });
  const routes = await routeTrpc(page, {
    ...createShellAmbientReads(corpus),
    ...serveCorpusProcedures(caller, [
      ...SECTION_PROCEDURES,
      ...ROOM_PROCEDURES,
      "plugin.getSurfaceState",
      "plugin.listCommands",
      "settings.updateUserSettingsSection",
      "notifications.presence",
      "rpg.getGame",
      "rpg.listTurnToolCalls",
    ]),
  });
  return { caller, room, installed, routes };
}

test("ordinary plugin panels share Context, collapse independently, and move individually to the sidecar", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const { caller, room, installed, routes } = await preparePanels(root, page, corpus);
  if (installed === null) {
    throw new Error("The panel fixture did not install its guest");
  }
  await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
  await page.getByRole("button", { name: "Plugin actions", exact: true }).click();
  await page.getByRole("menuitem", { name: CHAT_PLUGINS_OPEN_LABEL, exact: true }).click();
  await expect(page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true })).toHaveAttribute("aria-selected", "true");
  const context = page.getByRole("region", { name: CHAT_PLUGINS_TAB_LABEL, exact: true });
  await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
  await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="plugin-flank"]')).toHaveCount(0);
  await context.getByRole("textbox", { name: "First panel note", exact: true }).fill("Kept while folded");
  await page.screenshot({ path: "reports/plugin-context-wide.png" });
  const first = context.getByRole("button", { name: "Context witness — First", exact: true });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(context.getByText("First panel content", { exact: true })).toBeHidden();
  await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
  await expect(context.getByRole("textbox", { name: "First panel note", exact: true })).toHaveValue("Kept while folded");
  await context.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", true), exact: true }).click();
  const sidecar = page.locator('[data-slot="plugin-flank"]');
  await expect(sidecar.getByText("First panel content", { exact: true })).toBeVisible();
  await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
  await expect(page.getByText("First panel content", { exact: true })).toHaveCount(1);
  await expect
    .poll(async () => (await caller.settings.getUserSettings()).config.profile.sidecarChatPluginSurfaces)
    .toEqual([{ pluginId: installed.id, surfaceId: "first" }]);
  expect(routes.lastInput("settings.updateUserSettingsSection")).toEqual({
    section: "profile",
    patch: { sidecarChatPluginSurfaces: [{ pluginId: installed.id, surfaceId: "first" }] },
  });
  await page.screenshot({ path: "reports/plugin-context-sidecar.png" });
  await context.getByRole("button", { name: movePluginPanelLabel("Context witness", "Second", true), exact: true }).click();
  await expect(sidecar.getByText("Second panel content", { exact: true })).toBeVisible();
  await context.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", false), exact: true }).click();
  await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
  await context.getByRole("button", { name: movePluginPanelLabel("Context witness", "Second", false), exact: true }).click();
  await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
  await expect(sidecar).toHaveCount(0);
  await context
    .getByRole("group", { name: "Context witness — First", exact: true })
    .getByRole("button", { name: `${CHAT_PANEL_HIDE_LABEL} Context witness`, exact: true })
    .click();
  await expect(context.getByText("First panel content", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Close notification", exact: true }).click();
  await context.getByRole("button", { name: showInChatLabel("Context witness"), exact: true }).click();
  await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
  await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
  await expect.poll(async () => (await caller.settings.getUserSettings()).config.profile.sidecarChatPluginSurfaces).toEqual([]);
  await expect.poll(async () => (await caller.settings.getUserSettings()).config.profile.hiddenChatPluginIds).toEqual([]);
});

test("keyboard placement hands focus to the return control and back to the restored panel", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const { room } = await preparePanels(root, page, corpus);
  await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
  await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
  const context = page.getByRole("region", { name: CHAT_PLUGINS_TAB_LABEL, exact: true });
  const move = context.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", true), exact: true });
  await move.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-slot="plugin-flank"]').getByText("First panel content", { exact: true })).toBeVisible();
  const restore = context.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", false), exact: true });
  await expect(restore).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: "Context witness — First", exact: true })).toBeFocused();
});

test("a room with no plugin panels reserves no sidecar or collapse control and Context teaches the next step", async ({ corpus, page, mount }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const { room, routes } = await preparePanels(root, page, corpus, false);
  await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
  await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
  await expect(page.getByText(CHAT_PLUGINS_EMPTY_TITLE, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: CHAT_PLUGINS_MANAGE_LABEL, exact: true })).toBeEnabled();
  await expect(page.locator('[data-slot="plugin-flank"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(?:Show|Hide) plugin panels$/u })).toHaveCount(0);
  expect(routes.count("plugin.getSurfaceState")).toBe(0);
});

test.describe("touch placement", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("ordinary panels use mobile Context and only an explicitly selected panel opens in the sidecar sheet", async ({ corpus, page, mount }) => {
    await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
    const { room } = await preparePanels(root, page, corpus);
    await mount<typeof PluginHideFocusStory>("tests/client/features/plugin/components/_hide-focus-stories/PluginHideFocusStory", { chatId: room.id });
    await page.getByRole("button", { name: "Show details", exact: true }).click();
    await page.getByRole("tab", { name: CHAT_PLUGINS_TAB_LABEL, exact: true }).click();
    const context = page.getByRole("region", { name: CHAT_PLUGINS_TAB_LABEL, exact: true });
    await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
    await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
    await page.screenshot({ path: "reports/plugin-context-mobile.png" });
    await context.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", true), exact: true }).click();
    await expect(context.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", false), exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Close ${SECTION_LABELS.chats} details`, exact: true }).click();
    await page.getByRole("button", { name: "Message tools", exact: true }).click();
    await page.getByRole("menuitem", { name: PLUGIN_PANELS_SHEET_LABEL, exact: true }).click();
    const sheet = page.getByRole("dialog", { name: PLUGIN_PANELS_SHEET_LABEL, exact: true });
    await expect(sheet.getByText("First panel content", { exact: true })).toBeVisible();
    await expect(sheet.getByText("Second panel content", { exact: true })).toHaveCount(0);
    await expect(page.getByText("First panel content", { exact: true })).toHaveCount(1);
    await sheet.getByRole("button", { name: movePluginPanelLabel("Context witness", "First", false), exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(context.getByText("First panel content", { exact: true })).toBeVisible();
    await expect(context.getByText("Second panel content", { exact: true })).toBeVisible();
    await expect(context.getByRole("button", { name: "Context witness — First", exact: true })).toBeFocused();
  });
});
