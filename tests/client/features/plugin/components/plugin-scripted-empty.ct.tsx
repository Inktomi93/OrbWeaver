// @subject packages/client/src/features/plugin/components/plugin-scripted-surface.tsx
// A selected plugin page whose guest booted and published nothing for it shows the shared empty state, and its Reload action
// boots the guest again.

import { PLUGIN_UI_ROUTE } from "@orb/contracts/plugin";
import { routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusReadResponder } from "@orb/testkit/iso";
import { makePluginRow, makePluginScriptedPage } from "@orb/testkit/node/helpers";
import { PLUGIN_SURFACE_EMPTY_TITLE, PLUGIN_SURFACE_RELOAD_NAME } from "#client/features/plugin/lib/plugin-surface-names.ts";
import type { PluginProtocolStory } from "../_ct-stories.tsx";

const STORY = "tests/client/features/plugin/_ct-stories/PluginProtocolStory";
// A guest that boots and never renders the page's surface.
const SILENT_GUEST = "orb.ui(1);";

test.use({ hasTouch: false, isMobile: false });

test("a page whose guest publishes nothing shows the empty state, and Reload boots the guest again", async ({ corpus, corpusViewer, mount, page }) => {
  const plugin = makePluginRow({ declaredCapabilities: ["ui.surface"], grantedCapabilities: ["ui.surface"] });
  await routeTrpc(page, {
    "settings.getUserSettings": createCorpusReadResponder("settings.getUserSettings", corpusViewer.userId, corpus.reads["settings.getUserSettings"]),
    "sessions.me": createCorpusReadResponder("sessions.me", corpusViewer.userId, corpus.reads["sessions.me"]),
    "plugin.list": () => [plugin],
    "plugin.listSurfaces": () => [makePluginScriptedPage(plugin.id)],
    "plugin.getSurfaceState": (input) => (input.pluginId === plugin.id ? null : trpcError({ code: "NOT_FOUND" })),
  });
  let boots = 0;
  await page.route(`${PLUGIN_UI_ROUTE}/${plugin.id}`, (route) => {
    boots += 1;
    return route.fulfill({ contentType: "application/octet-stream", body: SILENT_GUEST });
  });
  await mount<typeof PluginProtocolStory>(STORY, { pluginId: plugin.id });

  const empty = page.locator('[data-slot="empty-state-root"]');
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText(PLUGIN_SURFACE_EMPTY_TITLE);
  // The development gallery mounts under StrictMode, which boots the guest twice before anyone presses Reload.
  const bootsBeforeReload = boots;
  await empty.locator('[data-slot="empty-state-action"]').getByRole("button", { name: PLUGIN_SURFACE_RELOAD_NAME, exact: true }).click();
  await expect.poll(() => boots).toBeGreaterThan(bootsBeforeReload);
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText(PLUGIN_SURFACE_EMPTY_TITLE);
});
