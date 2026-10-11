// CT: the phone's plugin-panels sheet on its own — the header icon and the bottom sheet it opens. Where the
// icon sits and which pointer mounts it is pinned beside the anchors (lib/chat-anchors.ct.tsx).

import type { PluginId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { PluginFlankSheetStory } from "../_ct-stories.tsx";

type PluginListRow = TrpcWireOutput<"plugin.list">[number];
type SurfaceRows = TrpcWireOutput<"plugin.listSurfaces">;

const PLUGIN_ID: PluginId = mintTypeId(ID_PREFIX.plugin);

const PLUGIN_ROW: PluginListRow = {
  id: PLUGIN_ID,
  slug: "tide-table",
  name: "Tide Table",
  version: "1.0.0",
  status: "enabled",
  origin: "upload",
  sourceUrl: null,
  sourceCommit: null,
  updateSource: null,
  declaredCapabilities: ["ui.surface"],
  grantedCapabilities: ["ui.surface"],
  netHosts: null,
  reconsentPending: false,
  widenedNetHosts: [],
  builtAgainst: null,
  description: "A fixture plugin.",
  lastError: null,
  installedAt: 0,
  updatedAt: 0,
};

test.describe("a touch device", () => {
  test.use({ hasTouch: true });

  test("the icon opens a sheet holding the room's flank panels, and the sheet closes from its own control", async ({ mount, page }) => {
    await page.setViewportSize({ width: 430, height: 740 });
    await routeTrpc(page, {
      "settings.getUserSettings": () => userSettingsView(),
      "plugin.list": () => [PLUGIN_ROW],
      "plugin.listSurfaces": (): SurfaceRows => [
        { pluginId: PLUGIN_ID, id: "tides", anchor: "chat-flank", title: "Tides", tier: "static", spec: { kind: "text", value: "high at noon" } },
      ],
      "plugin.getSurfaceState": () => null,
    });
    const component = await mount(<PluginFlankSheetStory />);

    await expect(component.getByText("high at noon")).toHaveCount(0);
    await page.getByRole("button", { name: "Plugin panels", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("group", { name: "Tide Table — Tides" })).toBeVisible();
    await expect(sheet.getByText("high at noon")).toBeVisible();

    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test("a room whose plugins have no flank panel grows no header icon", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    "settings.getUserSettings": () => userSettingsView(),
    "plugin.list": () => [PLUGIN_ROW],
    "plugin.listSurfaces": (): SurfaceRows => [],
    "plugin.getSurfaceState": () => null,
  });
  await mount(<PluginFlankSheetStory />);

  // Both reads have been answered, so the absence below is a settled one.
  await expect.poll(() => Math.min(recorder.count("plugin.list"), recorder.count("plugin.listSurfaces"))).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Collapse plugin panels", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Plugin panels", exact: true })).toHaveCount(0);
});

test("a fine pointer keeps the panels beside the transcript: the control collapses them and opens no sheet", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, {
    "settings.getUserSettings": () => userSettingsView(),
    "plugin.list": () => [PLUGIN_ROW],
    "plugin.listSurfaces": (): SurfaceRows => [
      { pluginId: PLUGIN_ID, id: "tides", anchor: "chat-flank", title: "Tides", tier: "static", spec: { kind: "text", value: "high at noon" } },
    ],
    "plugin.getSurfaceState": () => null,
  });
  await mount(<PluginFlankSheetStory />);

  await expect.poll(() => Math.min(recorder.count("plugin.list"), recorder.count("plugin.listSurfaces"))).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Collapse plugin panels", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Plugin panels", exact: true })).toHaveCount(0);
});
