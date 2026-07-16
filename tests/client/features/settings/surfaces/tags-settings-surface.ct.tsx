// CT: the real Tags settings pane (Task #65 — tags-settings-surface.tsx, the tag-management screen). Drives
// the production tag-domain flow: `tag.listTagsWithUsage` seeds the rows; each control fires its verb on the
// wire (rename → updateTag name patch, folder → updateTag folderType, hide → updateTag isHiddenOnCard,
// delete → removeTag, merge → mergeTags, prune → pruneUnusedTags). Assertions anchor to the real accessible
// names + the WIRE inputs (the mutations are busDriven — the stubbed responses don't refetch, so the check
// is the CALL, exactly like the System pane CT).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { TagsSettingsStory } from "../_ct-stories";

// The delete confirm's cascade line for "adventure" (5 characters, 1 chat, 1 world book — hoisted per
// useTopLevelRegex).
const DELETE_CASCADE = /5 characters, 1 chat, 1 world book/;

// Two owned tags with five-junction usage rollups — "adventure" is used (7 total), "orphan" is unused (0).
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

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "tag.listTagsWithUsage": () => TAGS,
    "tag.updateTag": () => TAGS[0],
    "tag.removeTag": () => undefined,
    "tag.mergeTags": () => undefined,
    "tag.setTagOrder": () => undefined,
    "tag.pruneUnusedTags": () => ({ removed: 1 }),
  });
}

test("lists every owned tag with its usage rollup", async ({ mount, page }) => {
  await stub(page);
  await mount(<TagsSettingsStory />);
  await expect(page.getByRole("textbox", { name: "Tag name (adventure)" })).toHaveValue("adventure");
  await expect(page.getByRole("textbox", { name: "Tag name (orphan)" })).toHaveValue("orphan");
  // The used tag shows its total; the unused one reads "unused" (and gates the row's own controls).
  await expect(page.getByText("7 uses")).toBeVisible();
  await expect(page.getByText("unused", { exact: true })).toBeVisible();
});

test("renaming a tag commits an updateTag name patch on blur", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagsSettingsStory />);
  const nameField = page.getByRole("textbox", { name: "Tag name (adventure)" });
  await nameField.fill("quest");
  await nameField.blur();
  // busDriven, no refetch (see file header) — no DOM correlate to wait on; tighten the poll interval.
  await expect
    .poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] })
    .toEqual({
      tagId: "tag_adventure",
      patch: { name: "quest" },
    });
});

test("clearing a tag color sends the updateTag tri-state null (clear to theme default)", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagsSettingsStory />);
  // "adventure" has a set background color (#3355ff) — open its ColorField and Reset to default. The
  // ColorField "" clear maps to `color: null` (the updateTag tri-state that clears the column), never a
  // literal empty string.
  await page.getByRole("button", { name: "Background color for adventure" }).click();
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect
    .poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] })
    .toEqual({
      tagId: "tag_adventure",
      patch: { color: null },
    });
});

test("toggling hide-on-card patches the hidden flag", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagsSettingsStory />);
  await page.getByRole("switch", { name: "Hide the adventure chip on cards" }).click();
  await expect
    .poll(() => trpc.lastInput("tag.updateTag"), { intervals: [20, 50, 100] })
    .toEqual({
      tagId: "tag_adventure",
      patch: { isHiddenOnCard: true },
    });
});

test("deleting a tag confirms, then fires removeTag with its id", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagsSettingsStory />);
  await page.getByRole("button", { name: "Delete adventure" }).click();
  // The confirm names the cascade + usage breakdown before the destructive action.
  await expect(page.getByText(DELETE_CASCADE)).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => trpc.lastInput("tag.removeTag"), { intervals: [20, 50, 100] }).toEqual({ tagId: "tag_adventure" });
});

test("merging picks a target and fires mergeTags source→target", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagsSettingsStory />);
  // Open the "adventure" row's merge picker, choose "orphan" as the target, confirm.
  await page.getByRole("button", { name: "Merge into…" }).first().click();
  await page.getByRole("combobox", { name: "Merge target tag" }).click();
  await page.getByRole("option", { name: "orphan" }).click();
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect
    .poll(() => trpc.lastInput("tag.mergeTags"), { intervals: [20, 50, 100] })
    .toEqual({
      sourceTagId: "tag_adventure",
      targetTagId: "tag_orphan",
    });
});

test("prune unused fires pruneUnusedTags", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<TagsSettingsStory />);
  await page.getByRole("button", { name: "Prune unused" }).click();
  await expect.poll(() => trpc.count("tag.pruneUnusedTags"), { intervals: [20, 50, 100] }).toBe(1);
});
