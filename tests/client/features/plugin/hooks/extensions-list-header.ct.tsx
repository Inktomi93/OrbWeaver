// @subject packages/client/src/features/plugin/hooks/use-extensions-list-header.tsx
// @subject packages/client/src/features/plugin/hooks/use-extensions-roster.ts
import type { PluginId } from "@orb/kit/ids";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc } from "@orb/testkit/ct";
import { makePluginRow } from "@orb/testkit/node/helpers";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ExtensionsListHeaderStory } from "./_list-header-stories.tsx";

const STORY = "tests/client/features/plugin/hooks/_list-header-stories/ExtensionsListHeaderStory";

type SurfaceRow = TrpcWireOutput<"plugin.listSurfaces">[number];

function surface(pluginId: PluginId, id: string, anchor: SurfaceRow["anchor"], title: string): SurfaceRow {
  return { pluginId, id, anchor, title, tier: "static" };
}

/** Two enabled plugins with one page each, plus a non-page surface that is not a Plugin pages row. */
async function routeTwoPages(page: Page): Promise<void> {
  const oracle = makePluginRow({ slug: "oracle-deck", name: "Oracle Deck" });
  const chips = makePluginRow({ slug: "scene-chips", name: "Scene Chips" });
  await routeTrpc(page, {
    "plugin.list": () => [oracle, chips],
    "plugin.listSurfaces": () => [
      surface(oracle.id, "deck_page", "page", "The Deck"),
      surface(chips.id, "chips_page", "page", "Chips"),
      surface(chips.id, "chips_settings", "settings", "Chip settings"),
    ],
  });
}

test("the band counts the registered pages, not every plugin surface", async ({ mount, page }) => {
  await routeTwoPages(page);
  const component = await mount<typeof ExtensionsListHeaderStory>(STORY, {});
  await expect(component.getByRole("heading", { level: 2 }).getByText("2", { exact: true })).toBeVisible();
});

test("a filter that matches nothing keeps the library total beside its zero", async ({ mount, page }) => {
  await routeTwoPages(page);
  const component = await mount<typeof ExtensionsListHeaderStory>(STORY, { query: "deck" });
  const heading = component.getByRole("heading", { level: 2 });
  await expect(heading.getByText("1", { exact: true })).toBeVisible();

  await component.update({ query: "no page has this name" });
  await expect(heading.getByText("0 of 2", { exact: true })).toBeVisible();
});
