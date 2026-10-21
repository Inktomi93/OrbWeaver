import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import { createCorpusReadResponder } from "@orb/testkit/iso/corpus-read-responder.ts";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { makePluginRow, makePluginScriptedPage } from "@orb/testkit/node/factories/plugin-view.ts";
import { routeTrpc, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import { PluginProtocolStory } from "../_ct-stories.tsx";

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

test("a refreshed action cannot inherit another action's open destructive confirmation", async ({ corpus, mount, page }) => {
  const plugin = makePluginRow({ declaredCapabilities: ["ui.surface", "storage.kv"], grantedCapabilities: ["ui.surface", "storage.kv"] });
  const refresh = trpcHold<"plugin.uiHostCall">();
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": () => null,
    "plugin.uiHostCall": refresh,
    "plugin.reportUiCrash": () => undefined,
  });
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => route.fulfill({ contentType: "application/octet-stream", body: UI_SOURCE }));
  await mount(<PluginProtocolStory pluginId={plugin.id} />);
  await page.getByRole("button", { name: "Refresh actions", exact: true }).click();
  await refresh.requested;
  await page.getByRole("button", { name: "Remove first", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Remove first?", exact: true })).toBeVisible();

  refresh.release({ resultJson: '"refreshed"' });
  await expect(page.getByText("Current second", { exact: true })).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  const nextTrigger = page.getByRole("button", { name: "Remove second", exact: true });
  await expect(nextTrigger).toBeFocused();
  await nextTrigger.click();
  const nextConfirm = page.getByRole("alertdialog", { name: "Remove second?", exact: true });
  await expect(nextConfirm).toBeVisible();
  await nextConfirm.getByRole("button", { name: "Remove second", exact: true }).click();
  await expect(page.getByText("Removed second", { exact: true })).toBeVisible();
  expect(trpc.unstubbed()).toEqual([]);
});
