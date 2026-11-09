// @subject packages/client/src/components/macro-browser.tsx
// @subject packages/client/src/features/plugin/lib/plugin-mutations.ts
// The macro browser names a plugin's macros and links to that plugin's own installed card; turning the plugin off in
// that card, through the production mutation, takes its macros out of the browser without a reload.

import { spawn } from "node:child_process";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, installMacroGuest } from "@orb/testkit/node/composed";
import { enablePluginLabel } from "#client/features/plugin/lib/plugin-copy.ts";
import type { PluginMacroBrowserStory } from "./_plugin-macro-browser-stories.tsx";

const STORY = "tests/client/features/plugin/components/_plugin-macro-browser-stories/PluginMacroBrowserStory";
const PLUGIN_NAME = "Omen Deck";
const LEDGER_NAME = "Ledger";
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
  await expect(page.getByRole("group", { name: `${PLUGIN_NAME} plugin`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Plugin: ${PLUGIN_NAME}`, exact: true }).click();
  await expect(page.getByRole("group", { name: `${PLUGIN_NAME} plugin`, exact: true })).toBeFocused();
});

test("a link pressed before the plugin list has loaded still lands on the card once it does", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const principal = await root.principalFor(root.ownerId);
  await installMacroGuest(root, principal, { slug: "omen-deck", name: PLUGIN_NAME }, [{ name: "omen", description: "Draws an omen." }]);
  await installMacroGuest(root, principal, { slug: "ledger", name: "Ledger" }, [{ name: "tally", description: "Counts coins." }]);
  const list = holdServed();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(
      caller,
      PROCEDURES.filter((path) => path !== "plugin.list"),
    ),
    ...serveCorpusProcedures(caller, ["plugin.list"], () => list),
  });

  await mount<typeof PluginMacroBrowserStory>(STORY, { cold: true });
  await page.getByRole("button", { name: `Plugin: ${PLUGIN_NAME}`, exact: true }).click();
  await list.requested;
  const card = page.getByRole("group", { name: `${PLUGIN_NAME} plugin`, exact: true });
  await expect(card).toHaveCount(0);

  list.release();
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
  const enabled = card.getByRole("switch", { name: enablePluginLabel(PLUGIN_NAME), exact: true });
  await expect(enabled).toHaveAttribute("aria-checked", "true");
  await enabled.click();
  await expect(macroName).toHaveCount(0);
  await expect(enabled).toHaveAttribute("aria-checked", "false");

  await enabled.click();
  await expect(macroName).toBeVisible();
});

test("two plugins in opposite states keep one switch name each, and only the flipped one changes aria-checked", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.internalCallerFor(root.ownerId);
  const principal = await root.principalFor(root.ownerId);
  await installMacroGuest(root, principal, { slug: "omen-deck", name: PLUGIN_NAME }, [{ name: "omen", description: "Draws an omen." }]);
  const ledgerId = await installMacroGuest(root, principal, { slug: "ledger", name: LEDGER_NAME }, [{ name: "tally", description: "Counts coins." }]);
  await caller.plugin.setEnabled({ pluginId: ledgerId, enabled: false });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));

  await mount<typeof PluginMacroBrowserStory>(STORY);
  const omen = page
    .getByRole("group", { name: `${PLUGIN_NAME} plugin`, exact: true })
    .getByRole("switch", { name: enablePluginLabel(PLUGIN_NAME), exact: true });
  const ledger = page
    .getByRole("group", { name: `${LEDGER_NAME} plugin`, exact: true })
    .getByRole("switch", { name: enablePluginLabel(LEDGER_NAME), exact: true });
  await expect(omen).toHaveAttribute("aria-checked", "true");
  await expect(ledger).toHaveAttribute("aria-checked", "false");

  await ledger.click();
  await expect(ledger).toHaveAttribute("aria-checked", "true");
  await expect(omen).toHaveAttribute("aria-checked", "true");
});
