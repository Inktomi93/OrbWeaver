// CT: the TAGS pane after its re-home into features/tag (SET-SEAMS stage 5 / D114). The pane definition
// moved features; its `(category, subId)` anchor pair, nav label and search keywords did NOT (§7.1/§7.2) —
// these are the pins that a move which silently broke a deep link would red. The pane stays `surface` mode,
// so the surface's own behavior is pinned by tags-settings-surface.ct.tsx at the mirror path.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SettingsShellDeepLinkStory, SettingsShellStory } from "../../settings/_ct-stories";

const USER_VIEWER = { userId: "user_ct_tags", handle: "kes", globalRole: "user" };

/** The search option's accessible name (hoisted per biome useTopLevelRegex — a literal re-compiled per call). */
const TAGS_OPTION = /Tags/;

const TAGS = [
  {
    id: "tag_adventure",
    name: "adventure",
    color: "#3355ff",
    color2: null,
    source: "manual",
    folderType: "NONE",
    sortOrder: 0,
    isHiddenOnCard: false,
    usage: { characters: 5, chats: 1, worldBooks: 1, personas: 0, presets: 0, total: 7 },
  },
];

function stub(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => ({ userId: USER_VIEWER.userId, schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "sessions.me": () => USER_VIEWER,
    "tag.listTagsWithUsage": () => TAGS,
  });
}

test("the Tags category is in the shell nav and mounts the REAL tag-management surface", async ({ mount, page }) => {
  await stub(page);

  const component = await mount(<SettingsShellStory />);
  const tagsNav = component.getByRole("button", { name: "Tags" });
  await expect(tagsNav).toBeVisible();
  await tagsNav.click();

  await expect(page.getByRole("button", { name: "New tag" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tag name (adventure)" })).toBeVisible();
});

// §7.1 — the anchor id keys on (category, subId), never on the owning feature: `settings-anchor-tags-tags`
// survives the move byte-identical, so a stored deep link still lands.
test("a sub-level deep link lands on the unchanged tags anchor", async ({ mount, page }) => {
  await stub(page);
  await mount(<SettingsShellDeepLinkStory target="tags" subId="tags" />);

  await expect(page.locator("#settings-anchor-tags-tags")).toBeVisible();
  await expect(page.getByRole("button", { name: "New tag" })).toBeVisible();
});

// §7.2 — the search keywords travelled with the pane definition into features/tag; a hit still jumps to a
// LIVE anchor (a stale leaf would scroll to nothing).
test("a search keyword of the moved pane still jumps to its live anchor", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<SettingsShellStory />);

  await component.getByRole("combobox", { name: "Search settings" }).fill("prune");
  const result = page.getByRole("option", { name: TAGS_OPTION }).first();
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator("#settings-anchor-tags-tags")).toBeInViewport();
});
