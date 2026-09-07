// CT: the ⌘K SETTINGS source (config-revamp-design.md §3.3/§6.4, #866 S2) — the SAME static index the LIST
// search derives, contributed to the command palette. Drives the production path: the door-bound group
// registry → `configPaletteSource.useRows` → cmdk rows under the "Settings" heading → a picked row runs
// `openConfigTo` (the deep link the host lands). Asserted at the STORE ACTION through the nav probe's
// sibling — this story mounts no config host, so a rendered echo would be asserting the harness; the deep
// link's whole payload is the (group, sub, setting) it targets, and `ConfigNavProbe` prints exactly that.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConfigNavProbe } from "../../../state/_ct-stories.tsx";
import { ConfigPaletteStory } from "../_ct-stories.tsx";

const ROUTES: Readonly<Record<string, unknown>> = {
  "chat.listChats": () => ({ items: [], nextCursor: null }),
  "sessions.me": { userId: "user_ct_palette", handle: "ct_palette", globalRole: "user" },
  "settings.getUserSettings": { userId: "user_ct_palette", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 },
};

test("the Settings source renders searchable rows under its own heading, group-labelled", async ({ mount, page }) => {
  await routeTrpc(page, ROUTES);
  const component = await mount(<ConfigPaletteStory />);

  await component.getByRole("combobox").fill("avatar size");
  await expect(component.getByText("Settings", { exact: true })).toBeVisible();
  const row = page.getByRole("option", { name: /Avatar size/ });
  await expect(row).toBeVisible();
  // Group-labelled: the owning group's name rides the row (the badge disambiguator).
  await expect(row).toContainText("Appearance");
});

test("a picked row deep-links: openConfigTo lands the (group, sub, setting) target and switches the section", async ({ mount, page }) => {
  await routeTrpc(page, ROUTES);
  await mount(
    <>
      <ConfigPaletteStory />
      <ConfigNavProbe />
    </>,
  );

  await page.getByRole("combobox").fill("avatar size");
  await page.getByRole("option", { name: /Avatar size/ }).click();

  const state = page.locator("output");
  await expect(state).toContainText("group=appearance");
  await expect(state).toContainText("target=appearance/avatars/avatar-size#");
  await expect(state).toContainText("section=config");
});

test("`when` parity rides into the palette: a plain viewer gets no admin rows", async ({ mount, page }) => {
  await routeTrpc(page, ROUTES);
  const component = await mount(<ConfigPaletteStory />);

  await component.getByRole("combobox").fill("engines");
  await expect(page.getByRole("option", { name: /Engines/ })).toHaveCount(0);
});
