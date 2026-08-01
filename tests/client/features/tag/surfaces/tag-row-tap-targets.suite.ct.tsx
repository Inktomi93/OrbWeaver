// CT: geometry guard for Task #76 — every interactive control in the Tags-settings row must clear the
// repo's 32px tap-target hard floor (design-audit's TAP_FAIL_PX) at the DEFAULT fine-pointer that a
// headless CT browser reports. Two side-eye passes flagged these controls at 28px (the pre-fix
// --spacing-control-sm / --spacing-switch-thumb value under @media(pointer:fine)). This measures the
// REAL rendered boundingBox (done ≠ rendered), so it fails if the token regresses below 32px.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { TagsSettingsStory } from "../_ct-stories";

const TAP_FAIL_PX = 32;

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
  {
    id: "tag_orphan",
    name: "orphan",
    color: null,
    color2: null,
    source: null,
    folderType: "NONE",
    sortOrder: 1,
    isHiddenOnCard: true,
    usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 },
  },
];

function stub(page: Page): Promise<unknown> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => TAGS,
    "tag.updateTag": () => TAGS[0],
    "tag.removeTag": () => undefined,
    "tag.mergeTags": () => undefined,
    "tag.setTagOrder": () => undefined,
    "tag.pruneUnusedTags": () => ({ removed: 1 }),
  });
}

async function shortSide(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("control has no bounding box (not laid out)");
  }
  return Math.min(box.width, box.height);
}

test("every tag-row control clears the 32px tap-target floor", async ({ mount, page }) => {
  await stub(page);
  await mount(<TagsSettingsStory />);
  await expect(page.getByRole("textbox", { name: "Tag name (adventure)" })).toBeVisible();

  const controls: ReadonlyArray<readonly [string, Locator]> = [
    ["reorder grip", page.getByRole("button", { name: "Reorder item" }).first()],
    ["bg swatch", page.getByRole("button", { name: "Background color for adventure" })],
    ["text swatch", page.getByRole("button", { name: "Text color for adventure" })],
    ["folder select", page.getByRole("combobox", { name: "Folder type for adventure" })],
    ["hide switch", page.getByRole("switch", { name: "Hide the adventure chip on cards" })],
    ["merge button", page.getByRole("button", { name: "Merge into…" }).first()],
    ["delete button", page.getByRole("button", { name: "Delete adventure" })],
  ];

  const sides = await Promise.all(controls.map(async ([label, locator]) => [label, await shortSide(locator)] as const));
  const undersized = sides.filter(([, side]) => side < TAP_FAIL_PX).map(([label, side]) => `${label}: ${side.toFixed(1)}px`);
  expect(undersized, `controls below the ${TAP_FAIL_PX}px floor: ${undersized.join(", ")}`).toEqual([]);
});
