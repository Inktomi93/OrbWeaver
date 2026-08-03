// CT: the shared tag picker's SUGGESTION half (tag-experience audit 2026-08-03). The end-to-end
// attach/create flow is pinned from the library surface; what only a direct mount can reach are the three
// states of the suggestion source, which must NOT say the same thing:
//   · an empty library ("no tags yet")   · every tag already attached   · a stocked library, at rest.
// A null-when-empty field would read as unbuilt, and one shared "no results" sentence would be wrong in
// two of the three.
//
// Also pinned: the picker never suggests a tag that is already attached (a suggestion whose only outcome
// is a no-op write), and it submits the LIBRARY's spelling when the typed text differs only in case —
// otherwise a "Fantasy" keystroke is how the display name of "fantasy" starts drifting.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc";
import { TagPickerDialogHarness } from "./tag-picker-dialog.fixtures";

const tag = (id: string, name: string, total: number): unknown => ({
  id,
  name,
  color: null,
  color2: null,
  source: "manual",
  folderType: "NONE",
  sortOrder: 0,
  isHiddenOnCard: false,
  usage: { characters: total, chats: 0, worldBooks: 0, personas: 0, presets: 0, total },
});

const LIBRARY = [tag("tag_adventure", "adventure", 5), tag("tag_fantasy", "fantasy", 12)];

function stub(page: Page, tags: readonly unknown[]): Promise<unknown> {
  return routeTrpc(page, { "tag.listTagsWithUsage": () => tags });
}

test("an EMPTY library says so, and still leads somewhere (typing creates the first tag)", async ({ mount, page }) => {
  await stub(page, []);
  const dialog = await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("No tags yet — the name you type becomes your first one.")).toBeVisible();

  await page.getByRole("combobox", { name: "Tag name" }).fill("adventure");
  await page.getByRole("button", { name: 'Create "adventure"' }).click();
  await expect(dialog.getByTestId("submitted")).toHaveText("adventure");
});

test("EVERY tag already attached is its own sentence — not the empty-library one", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness attachedNames={["adventure", "fantasy"]} />);
  await expect(page.getByText("Every tag you have is already attached. A new name creates a new tag.")).toBeVisible();
  await expect(page.getByText("No tags yet — the name you type becomes your first one.")).toHaveCount(0);
});

test("a stocked library counts what you can pick from, at rest", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("Start typing to search your 2 tags.")).toBeVisible();
});

test("an ATTACHED tag is never suggested (its only outcome would be a no-op write)", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  await mount(<TagPickerDialogHarness attachedNames={["fantasy"]} />);
  await expect(page.getByText("Start typing to search your 1 tag.")).toBeVisible();

  const field = page.getByRole("combobox", { name: "Tag name" });
  await field.click();
  await field.pressSequentially("a");
  // "adventure" matches and is offered; "fantasy" matches too but is already on the card.
  await expect(page.getByRole("option", { name: "adventure" })).toBeVisible();
  await expect(page.getByRole("option", { name: "fantasy" })).toHaveCount(0);
});

test("a case-only difference ATTACHES the existing tag, and submits the library's spelling", async ({ mount, page }) => {
  await stub(page, LIBRARY);
  const dialog = await mount(<TagPickerDialogHarness />);
  await expect(page.getByText("Start typing to search your 2 tags.")).toBeVisible();

  await page.getByRole("combobox", { name: "Tag name" }).fill("FANTASY");
  await expect(page.getByText('Attaches the existing tag "fantasy".')).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  // The LIBRARY's spelling on the wire, not the shouted one.
  await expect(dialog.getByTestId("submitted")).toHaveText("fantasy");
});
