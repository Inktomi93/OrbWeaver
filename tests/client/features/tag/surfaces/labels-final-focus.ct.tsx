// A Labels prune or delete removes the control that opened its confirm, so the close must land on the finder root.
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { TAG_LIST_NAME } from "#client/features/tag/lib/tag-list-name.ts";
import type { LabelsListStory } from "./_labels-list-stories.tsx";

const STORY = "tests/client/features/tag/surfaces/_labels-list-stories/LabelsListStory";
const UNUSED = "Unattached label";

test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

const LABEL_READS = ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage", "tag.pruneUnusedTags", "tag.removeTag"] as const;

/** The corpus library is windowed, so the finder's own filter brings the new label's row into the tree. */
async function showUnused(page: Page): Promise<Locator> {
  await page.getByRole("textbox", { name: "Filter tags", exact: true }).fill(UNUSED);
  const row = page.getByRole("button", { name: UNUSED, exact: true });
  await expect(row).toBeVisible();
  return row;
}

/** Both pointer kinds: Base UI resolves a close's focus return per interaction type. */
const POINTERS = ["mouse", "touch"] as const;

function press(target: Locator, pointer: (typeof POINTERS)[number]): Promise<void> {
  return pointer === "touch" ? target.tap() : target.click();
}

for (const pointer of POINTERS) {
  test(`a prune confirm closes onto the finder root, not the overflow trigger that opened it (${pointer})`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.tag.createTag({ input: { name: UNUSED } });
    await routeTrpc(page, serveCorpusProcedures(caller, LABEL_READS));
    await mount<typeof LabelsListStory>(STORY, {});
    const overflow = page.getByRole("button", { name: "More tag actions", exact: true });
    await expect(page.getByRole("list", { name: TAG_LIST_NAME, exact: true })).toBeVisible();

    await press(overflow, pointer);
    await press(page.getByRole("menuitem", { name: "Prune unused tags" }), pointer);
    const confirm = page.getByRole("alertdialog");
    await press(confirm.getByRole("button", { name: /^Delete/u }), pointer);
    // The rows refresh from the user bus, which no component mount carries; the focus handoff is the subject.
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('[data-slot="labels-finder"]')).toBeFocused();
  });

  test(`a row delete confirm closes onto the finder root, not the row's own actions (${pointer})`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.tag.createTag({ input: { name: UNUSED } });
    await routeTrpc(page, serveCorpusProcedures(caller, LABEL_READS));
    await mount<typeof LabelsListStory>(STORY, {});
    await showUnused(page);

    await press(page.getByRole("button", { name: `Actions for ${UNUSED}`, exact: true }), pointer);
    await press(page.getByRole("menuitem", { name: "Delete" }), pointer);
    const confirm = page.getByRole("alertdialog");
    await press(confirm.getByRole("button", { name: "Delete", exact: true }), pointer);
    await expect(confirm).toHaveCount(0);
    await expect(page.locator('[data-slot="labels-finder"]')).toBeFocused();
  });
}
