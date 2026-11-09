// @subject packages/client/src/features/plugin/components/plugin-row.tsx
// The "Show in chat" switch sits on the settings track beside its label, not at the card's trailing edge.

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow } from "@orb/testkit/node/helpers";
import { enablePluginLabel, showInChatSwitchName } from "#client/features/plugin/lib/plugin-copy.ts";
import type { InstalledPluginsStory } from "./_show-in-chat-stories.tsx";

const STORY = "tests/client/features/plugin/components/_show-in-chat-stories/InstalledPluginsStory";

test.use({ viewport: { width: 1440, height: 900 } });

test("the panel switch sits within one track gutter of its label's text", async ({ mount, page }) => {
  const plugin = makePluginRow({ slug: "pocket-arcade", name: "Pocket Arcade", status: "enabled" });
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [{ pluginId: plugin.id, id: "arcade_flank", anchor: "chat-flank", title: "Arcade", tier: "static" }],
  });
  const component = await mount<typeof InstalledPluginsStory>(STORY, { width: 960 });
  const name = showInChatSwitchName(plugin.name);
  const toggle = component.getByRole("switch", { name, exact: true });
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  const text = await component.getByText(name, { exact: true }).evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const { left, right } = range.getBoundingClientRect();
    return { right, width: right - left };
  });
  // Beside the label means closer than the label is long; the pinned-to-edge row sat two label-widths away.
  expect((box?.x ?? Number.POSITIVE_INFINITY) - text.right).toBeLessThan(text.width);
});

test("each card's enable and panel switches share one track and are named for their own plugin", async ({ mount, page }) => {
  const make = (slug: string, name: string): ReturnType<typeof makePluginRow> =>
    makePluginRow({ slug, name, status: "enabled", declaredCapabilities: ["ui.surface"], grantedCapabilities: ["ui.surface"] });
  const plugins = [make("pocket-arcade", "Pocket Arcade"), make("story-clocks", "Story Clocks")];
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]),
    "plugin.list": () => plugins,
    "plugin.listSurfaces": () =>
      plugins.map((plugin) => ({ pluginId: plugin.id, id: `${plugin.slug}_flank`, anchor: "chat-flank" as const, title: "Panel", tier: "static" as const })),
  });
  const component = await mount<typeof InstalledPluginsStory>(STORY, { width: 960 });
  for (const plugin of plugins) {
    // Strict locators: two switches sharing a name make these throw instead of picking one.
    const enabled = await component.getByRole("switch", { name: enablePluginLabel(plugin.name), exact: true }).boundingBox();
    const shown = await component.getByRole("switch", { name: showInChatSwitchName(plugin.name), exact: true }).boundingBox();
    expect(enabled?.x).toBe(shown?.x);
  }
  await expect(component.getByText("On", { exact: true })).toHaveCount(0);
});

test("two plugins' panel switches are found by their stable names, and a flip moves only aria-checked", async ({ mount, page }) => {
  const make = (slug: string, name: string): ReturnType<typeof makePluginRow> =>
    makePluginRow({ slug, name, status: "enabled", declaredCapabilities: ["ui.surface"], grantedCapabilities: ["ui.surface"] });
  const [stays, hides] = [make("pocket-arcade", "Pocket Arcade"), make("story-clocks", "Story Clocks")];
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "settings.updateUserSettingsSection"]),
    "plugin.list": () => [stays, hides],
    "plugin.listSurfaces": () =>
      [stays, hides].map((plugin) => ({
        pluginId: plugin.id,
        id: `${plugin.slug}_flank`,
        anchor: "chat-flank" as const,
        title: "Panel",
        tier: "static" as const,
      })),
  });
  const component = await mount<typeof InstalledPluginsStory>(STORY, { width: 960 });
  const staysSwitch = component.getByRole("switch", { name: showInChatSwitchName(stays.name), exact: true });
  const hidesSwitch = component.getByRole("switch", { name: showInChatSwitchName(hides.name), exact: true });
  await expect(staysSwitch).toHaveAttribute("aria-checked", "true");
  await expect(hidesSwitch).toHaveAttribute("aria-checked", "true");
  await hidesSwitch.click();
  await expect(hidesSwitch).toHaveAttribute("aria-checked", "false");
  await expect(staysSwitch).toHaveAttribute("aria-checked", "true");
});
