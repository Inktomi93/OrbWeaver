// CT: BackgroundSourceField (BG-C) on the Looks grammar (#866 S4, owner R-BG addendum) — the shared
// carried-background picker both call sites mount (a room override's immediate mutate, a card editor's
// patch). Red-first: the pre-S4 field was a kind Select + name Selects; the grid grammar is the change
// under test. Pins: a tile tap yields the FULL ThemeBackground value (kind derived from the tile); the None
// tile clears; every image tile derives from the viewer's own `backgroundLibrary`; NO upload/manage here —
// the Add affordance is the Settings LINK; read-only renders the grid inert.
//
// THE PLATES ARE LIBRARY ROWS NOW (2026-09-18). This CT used to tap a tile from a static `kind:"seeded"`
// catalog the grid rendered unconditionally; that kind retired, and the bundled scene plates are seeded per
// user into `appearance.backgroundLibrary`, so a plate tile IS a library tile and the stub seeds one.

import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../support/node/route-trpc.ts";
import { BackgroundSourceFieldStory } from "./background-source-field.fixtures.tsx";

const ENTRY = { entryId: "e1", assetId: castId<AssetId>("asset_00000000000000000000000001"), assetHash: "hashaaa", mime: "image/png", name: "My dock" };
/** A bundled scene plate, as the viewer's library actually carries it after the per-user seed. */
const PLATE = {
  entryId: "e0",
  assetId: castId<AssetId>("asset_00000000000000000000000002"),
  assetHash: "hashplate",
  mime: "image/jpeg",
  name: "Charlotte's study",
};

function stub(page: Page, library = [PLATE, ENTRY]): ReturnType<typeof routeTrpc> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({
      userId: "user_ct_bg",
      schemaVersion: 1,
      config: { appearance: { backgroundLibrary: library } },
      updatedAt: 0,
      configUnreadable: null,
    }),
  });
}

test("a bundled-plate tile tap yields the FULL ThemeBackground value — the kind derives from the tile", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<BackgroundSourceFieldStory />);
  const grid = component.getByRole("grid", { name: "Background" });
  await grid.getByRole("gridcell", { name: PLATE.name }).click();
  // A shipped plate writes exactly what an upload writes — that sameness IS the retirement of `kind:"seeded"`.
  await expect(component.locator("output")).toContainText('"kind":"asset"');
  await expect(component.locator("output")).toContainText(`"assetHash":"${PLATE.assetHash}"`);
});

test("a library tile tap yields the asset triple; the None tile clears", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<BackgroundSourceFieldStory />);
  const grid = component.getByRole("grid", { name: "Background" });
  await expect(grid.getByRole("gridcell", { name: "My dock" })).toBeVisible();
  await grid.getByRole("gridcell", { name: "My dock" }).click();
  await expect(component.locator("output")).toContainText('"kind":"asset"');
  await expect(component.locator("output")).toContainText(`"assetId":"${ENTRY.assetId}"`);
  await expect(component.locator("output")).toContainText(`"assetHash":"${ENTRY.assetHash}"`);

  await grid.getByRole("gridcell", { name: "No background" }).click();
  await expect(component.locator("output")).toContainText('"kind":"none"');
});

test("no upload/manage here — the Add affordance is the Settings LINK, and the URL arm stays discrete", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<BackgroundSourceFieldStory />);
  await expect(component.getByRole("button", { name: "Add your own in Settings" })).toBeVisible();
  await expect(component.getByRole("button", { name: /Upload/ })).toHaveCount(0);

  // The URL arm: entering a draft commits NOTHING until Apply (F-P0-2 — the server materializes a fetch).
  await component.getByRole("button", { name: "From a URL…" }).click();
  await component.getByRole("textbox", { name: "Background image URL" }).fill("https://example.com/a.png");
  await expect(component.locator("output")).not.toContainText("external");
  await component.getByRole("button", { name: "Apply" }).click();
  await expect(component.locator("output")).toContainText('"kind":"external"');
});

test("read-only renders the grid inert — a tap changes nothing (the room member branch)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<BackgroundSourceFieldStory readOnly={true} />);
  const grid = component.getByRole("grid", { name: "Background" });
  await grid.getByRole("gridcell", { name: PLATE.name }).click();
  await expect(component.locator("output")).toHaveText("none");
  await expect(component.getByRole("button", { name: "From a URL…" })).toHaveCount(0);
});
