// CT: the REGEX pane after its re-home into features/regex (SET-SEAMS stage 5 / D114). The pane definition
// moved features; its `(category, subId)` anchor pair, nav label and search keywords did NOT (§7.1/§7.2) —
// these are the pins that a move which silently broke a deep link would red. The pane stays `surface` mode,
// so the script library's own CRUD behavior is pinned by regex-settings-surface.ct.tsx at the mirror path.
//
// D121-E re-pointed the DATA the surface reads, not the pane's identity: the body used to render from
// `settings.getUserSettings`'s `config.regex.scripts` blob and now reads the `regex` router (`listScripts`
// + `listGlobal`). The nav/anchor/keyword pins below are unchanged — which is the point: the storage
// reshape moved a surface's source without moving the door a stored deep link aims at.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SettingsShellDeepLinkStory, SettingsShellStory } from "../../settings/_ct-stories";

const USER_VIEWER = { userId: "user_ct_regex", handle: "kes", globalRole: "user" };

/** The search option's accessible name (hoisted per biome useTopLevelRegex — a literal re-compiled per call). */
const SCRIPTS_OPTION = /Scripts/;

function stub(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({ userId: USER_VIEWER.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "sessions.me": () => USER_VIEWER,
    // The library reads (D121-E). An EMPTY library is deliberate here: this file pins the pane's door, and
    // the door must open on an empty library exactly as it does on a full one.
    "regex.listScripts": () => [],
    "regex.listGlobal": () => [],
  });
}

test("the Regex category is in the shell nav and mounts the REAL script library", async ({ mount, page }) => {
  await stub(page);

  const component = await mount(<SettingsShellStory />);
  const regexNav = component.getByRole("button", { name: "Regex" });
  await expect(regexNav).toBeVisible();
  await regexNav.click();

  await expect(page.getByRole("heading", { name: "Scripts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add script" })).toBeVisible();
});

// §7.1 — the anchor id keys on (category, subId), never on the owning feature: `settings-anchor-regex-scripts`
// survives the move byte-identical, so a stored deep link still lands.
test("a sub-level deep link lands on the unchanged scripts anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<SettingsShellDeepLinkStory target="regex" subId="scripts" />);

  await expect(page.locator("#settings-anchor-regex-scripts")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add script" })).toBeVisible();
});

// §7.2 — the search keywords travelled with the pane definition into features/regex; a hit still jumps to a
// LIVE anchor (a stale leaf would scroll to nothing).
test("a search keyword of the moved pane still jumps to its live anchor", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("substitute");
  const result = page.getByRole("option", { name: SCRIPTS_OPTION }).first();
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator("#settings-anchor-regex-scripts")).toBeInViewport();
});
