// @subject packages/client/src/features/plugin/components/plugin-row.tsx
// The "Show … panel in chat" switch sits on the settings track beside its label, not at the card's trailing edge.

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { makePluginRow } from "@orb/testkit/node/helpers";
import { showInChatLabel } from "#client/features/plugin/lib/plugin-copy.ts";
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
  const name = showInChatLabel(plugin.name);
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
