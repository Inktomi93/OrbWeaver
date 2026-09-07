// CT: the Extensions LIST chrome-band header (#1190) — the section identity that fills the
// `.shell-panel-header` band via the `listHeader` mint slot, mirroring `corpus-list-header.ct.tsx`. Pins that
// the band names the section ("Extensions") and states the live page count; a zero count renders the title
// alone (no "0"), matching every other section's band idiom (`ListPaneHeader`'s own zero-census rule).

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ExtensionsListHeaderStory } from "../_ct-stories.tsx";

const A_PAST_INSTANT = 1_760_000_000_000;
const ORACLE_ID = castId<PluginId>("plugin_ct_oracle00000001");
const CHIPS_ID = castId<PluginId>("plugin_ct_chips000000001");

function pluginRow(id: PluginId, slug: string, name: string): Record<string, unknown> {
  return {
    id,
    slug,
    name,
    version: "1.0.0",
    status: "enabled",
    origin: "upload",
    declaredCapabilities: ["ui.surface"],
    grantedCapabilities: ["ui.surface"],
    netHosts: null,
    reconsentPending: false,
    widenedNetHosts: [],
    builtAgainst: null,
    consecutiveCrashes: 0,
    lastError: null,
    installedAt: A_PAST_INSTANT,
    updatedAt: A_PAST_INSTANT,
  };
}

function pageRow(pluginId: PluginId, id: string, title: string): Record<string, unknown> {
  return { pluginId, id, anchor: "page", title, tier: "static", spec: undefined };
}

test("the LIST band names Extensions and states the live page count", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck"), pluginRow(CHIPS_ID, "scene-chips", "Scene Chips")],
    "plugin.listSurfaces": () => [pageRow(ORACLE_ID, "deck_page", "The Deck"), pageRow(CHIPS_ID, "chips_page", "Chips")],
  });
  const component = await mount(<ExtensionsListHeaderStory />);

  await expect(component.getByText("Extensions")).toBeVisible();
  await expect(component.getByText("2")).toBeVisible();
});

test("zero registered pages renders the title alone, no number", async ({ mount, page }) => {
  await routeTrpc(page, {
    "plugin.list": () => [pluginRow(ORACLE_ID, "oracle-deck", "Oracle Deck")],
    "plugin.listSurfaces": () => [],
  });
  const component = await mount(<ExtensionsListHeaderStory />);

  await expect(component.getByText("Extensions")).toBeVisible();
  await expect(component.getByText("0")).toHaveCount(0);
});
