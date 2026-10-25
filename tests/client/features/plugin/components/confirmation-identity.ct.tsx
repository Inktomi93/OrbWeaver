import { spawn } from "node:child_process";
import { PLUGIN_MAIN_ENTRY, PLUGIN_UI_ENTRY, PLUGIN_UI_ROUTE, pluginManifestSchema } from "@orb/contracts/plugin";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, makePluginBundle, seedInstalledPlugin, seedPluginGrant } from "@orb/testkit/node/composed";
import { strToU8 } from "fflate";
import type { PluginProtocolStory } from "../_ct-stories.tsx";

const UI_SOURCE = `const ui = orb.ui(1);
const render = (second) => ui.render("protocol", { kind: "stack", children: [
  { kind: "text", value: second ? "Current second" : "Current first" },
  { kind: "button", label: "Refresh actions", actionId: "refresh" },
  { kind: "confirmButton", label: second ? "Remove second" : "Remove first",
    actionId: second ? "remove_second" : "remove_first",
    confirmTitle: second ? "Remove second?" : "Remove first?" }
] });
render(false);
ui.onEvent(async ({ event }) => {
  if (event.actionId === "refresh") {
    await ui.host.storage.get("refresh");
    render(true);
  } else if (event.actionId === "remove_second") {
    ui.render("protocol", { kind: "text", value: "Removed second" });
  }
});`;

test("a refreshed action cannot inherit another action's open destructive confirmation", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { pluginSpawn: spawn });
  const caller = await root.principalFor(root.ownerId);
  const manifest = pluginManifestSchema.parse({
    id: "confirm-identity",
    name: "Confirmation identity",
    description: "Refreshed destructive actions",
    version: "1.0.0",
    hostVersion: 1,
    entry: PLUGIN_MAIN_ENTRY,
    uiEntry: PLUGIN_UI_ENTRY,
    capabilities: ["ui.surface", "storage.kv"],
  });
  const installed = await seedInstalledPlugin(root, {
    caller,
    grant: [],
    bundle: makePluginBundle(
      manifest,
      'const h = orb.host(1); h.ui.register({ id: "protocol", anchor: "page", title: "Protocol", tier: "scripted" }); h.storage.set("refresh", "refreshed");',
      root.clock.now(),
      { [PLUGIN_UI_ENTRY]: strToU8(UI_SOURCE) },
    ),
  });
  const plugin = installed.outcome;
  expect(
    (await seedPluginGrant(root, { caller, pluginId: plugin.id, grant: manifest.capabilities, acknowledgedNetHosts: [], enable: true })).outcome.status,
  ).toBe("enabled");
  const refresh = holdServed();
  const rpc = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(rpc, ["settings.getUserSettings", "sessions.me", "plugin.list", "plugin.listSurfaces", "plugin.getSurfaceState"]),
    ...serveCorpusProcedures(rpc, ["plugin.uiHostCall"], () => refresh),
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: UI_SOURCE }));
  await mount<typeof PluginProtocolStory>("tests/client/features/plugin/_ct-stories/PluginProtocolStory", { pluginId: plugin.id });
  await page.getByRole("button", { name: "Refresh actions", exact: true }).click();
  await refresh.requested;
  await page.getByRole("button", { name: "Remove first", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Remove first?", exact: true })).toBeVisible();

  refresh.release();
  await expect(page.getByText("Current second", { exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const nextTrigger = page.getByRole("button", { name: "Remove second", exact: true });
  await expect(nextTrigger).toBeFocused();
  await nextTrigger.click();
  const nextConfirm = page.getByRole("alertdialog", { name: "Remove second?", exact: true });
  await expect(nextConfirm).toBeVisible();
  await nextConfirm.getByRole("button", { name: "Remove second", exact: true }).click();
  await expect(page.getByText("Removed second", { exact: true })).toBeVisible();
});
