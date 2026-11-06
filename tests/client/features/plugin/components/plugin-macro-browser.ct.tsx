// @subject packages/client/src/components/macro-browser.tsx
// @subject packages/client/src/features/plugin/lib/plugin-mutations.ts
// The macro browser names a plugin's macros and links to that plugin's own installed card; turning the plugin off in
// that card, through the production mutation, takes its macros out of the browser without a reload.

import { spawn } from "node:child_process";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, installMacroGuest } from "@orb/testkit/node/composed";
import type { PluginMacroBrowserStory } from "./_plugin-macro-browser-stories.tsx";

const STORY = "tests/client/features/plugin/components/_plugin-macro-browser-stories/PluginMacroBrowserStory";
const PLUGIN_NAME = "Omen Deck";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "plugin.listMacros",
  "plugin.listDistributed",
  "plugin.setEnabled",
  "connection.listBindings",
] as const;

test("the browser's plugin link lands on that plugin's own installed card", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const principal = await root.principalFor(root.ownerId);
  await installMacroGuest(root, principal, { slug: "omen-deck", name: PLUGIN_NAME }, [{ name: "omen", description: "Draws an omen." }]);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));

  await mount<typeof PluginMacroBrowserStory>(STORY);
  const card = page.getByRole("group", { name: `${PLUGIN_NAME} plugin`, exact: true });
  // The landing looks for the card once, so the list it lives in has to be loaded first.
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: `Plugin: ${PLUGIN_NAME}`, exact: true }).click();
  await expect(card).toBeFocused();
});

test("a plugin turned off in its card leaves the browser, and turned back on returns", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  const pluginId = await installMacroGuest(root, principal, { slug: "omen-deck", name: PLUGIN_NAME }, [{ name: "omen", description: "Draws an omen." }]);
  const [row] = (await caller.plugin.listMacros()).filter((macro) => macro.pluginId === pluginId);
  if (row === undefined) {
    throw new Error("the enabled plugin listed no macro");
  }
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));

  await mount<typeof PluginMacroBrowserStory>(STORY);
  const macroName = page.getByText(`{{${row.name}}}`, { exact: true });
  await expect(macroName).toBeVisible();

  const card = page.getByRole("group", { name: `${PLUGIN_NAME} plugin`, exact: true });
  await card.getByRole("switch", { name: `Turn ${PLUGIN_NAME} off`, exact: true }).click();
  await expect(macroName).toHaveCount(0);

  await card.getByRole("switch", { name: `Turn ${PLUGIN_NAME} on`, exact: true }).click();
  await expect(macroName).toBeVisible();
});
