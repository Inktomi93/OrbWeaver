// @subject packages/client/src/components/tag-picker-dialog.tsx
// The tag picker dialog reads the tag library through the shared boundary only while open: a held read shows the busy helper line, a failed one
// the shared error block, and Retry brings the create arm. The field and the dialog shell stay mounted throughout, and the footer does
// not move when the read lands.

import { createTagSchema } from "@orb/contracts/tag";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { ServedHold } from "@orb/testkit/ct";
import { heldThenFailing, holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { createTagName, TAG_LIBRARY_READ_LABEL, TAG_NAME_FIELD_NAME } from "#client/components/shared-control-names.ts";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { CHARACTER_ADD_TAG_NAME } from "#client/features/character/lib/character-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { CharacterTagsRowStory } from "./_tag-row-stories.tsx";

const ROW_STORY = "tests/client/features/character/components/_tag-row-stories/CharacterTagsRowStory";
const SHELL_READS = ["sessions.me", "settings.getUserSettings"] as const;

test("the tag picker field stays typeable in one dialog while the library is held and failed, and Retry brings the create-or-attach line", async ({
  mount,
  page,
}) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.tag.createTag({ input: createTagSchema.parse({ name: "Picked" }) });
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SHELL_READS), ...serveCorpusProcedures(caller, ["tag.listTagsWithUsage"], read.intercept) });
  await mount<typeof CharacterTagsRowStory>(ROW_STORY, { characterId: mintTypeId(ID_PREFIX.character, createSeededIds().next), tags: [] });
  await page.getByRole("button", { name: CHARACTER_ADD_TAG_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await read.hold.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  const field = dialog.getByRole("combobox", { name: TAG_NAME_FIELD_NAME });
  await field.fill("Pic");
  // The field still describes what the confirm will do while the library is unknown.
  await expect(field).toHaveAccessibleDescription(/Pic/u);
  const shell = await dialog.elementHandle();
  read.hold.fail();
  await expect(dialog.getByText(queryFailedLabel(TAG_LIBRARY_READ_LABEL), { exact: true })).toBeVisible();
  await expect(field).toHaveValue("Pic");
  read.recover();
  await dialog.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(dialog.getByText(queryFailedLabel(TAG_LIBRARY_READ_LABEL), { exact: true })).toHaveCount(0);
  await expect(field).toHaveValue("Pic");
  await expect(dialog.getByRole("button", { name: createTagName("Pic"), exact: true })).toBeVisible();
  // The dialog shell is the same node from the held read to the settled one: it never remounts, so its open animation never replays.
  expect(await shell.evaluate((node) => node.isConnected)).toBe(true);
});

/** Desktop and the phone shell, which `shell.css` switches to below 48rem. */
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
] as const;

/** A root whose library holds one tag, served to the page with its library read held until the test lets it land. */
async function heldLibrary(page: Page, root: Awaited<ReturnType<typeof createServerHarness>>, viewport: (typeof VIEWPORTS)[number]): Promise<ServedHold> {
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.tag.createTag({ input: createTagSchema.parse({ name: "Picked" }) });
  const hold = holdServed();
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SHELL_READS), ...serveCorpusProcedures(caller, ["tag.listTagsWithUsage"], () => hold) });
  return hold;
}

/** Open the picker while its library read is held and let the open transition settle. */
async function openPicker(page: Page, hold: ServedHold): Promise<Locator> {
  await page.getByRole("button", { name: CHARACTER_ADD_TAG_NAME, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await hold.requested;
  await dialog.evaluate(async (element) => {
    // The open transition settles; a looping placeholder shimmer never finishes and moves nothing.
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((animation) => animation.finished),
    );
  });
  return dialog;
}

for (const viewport of VIEWPORTS) {
  test(`the tag picker's footer holds its place when the library read lands under an empty field (${viewport.name})`, async ({ mount, page }) => {
    await using root = await createServerHarness({ startJobs: false });
    const hold = await heldLibrary(page, root, viewport);
    await mount<typeof CharacterTagsRowStory>(ROW_STORY, { characterId: mintTypeId(ID_PREFIX.character, createSeededIds().next), tags: [] });
    const dialog = await openPicker(page, hold);
    const cancel = dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
    await expect(cancel).toBeVisible();
    const ready = await cancel.boundingBox();
    await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
    hold.release();
    await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0);
    expect(await cancel.boundingBox()).toEqual(ready);
  });
}
