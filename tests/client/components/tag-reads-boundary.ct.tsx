// @subject packages/client/src/components/editable-tag-chip.tsx
// The tag chip's popover reads the tag library through the shared boundary only while open: a held read shows the
// loading skeleton, a failed one the shared error block, and Retry shows the editor.

import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { createTagSchema } from "@orb/contracts/tag";
import { heldThenFailing, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { EditableTagChipStory } from "./_editable-tag-chip-stories.tsx";

const CHIP_STORY = "tests/client/components/_editable-tag-chip-stories/EditableTagChipStory";
const SHELL_READS = ["sessions.me", "settings.getUserSettings"] as const;

test("a held tag library read shows the loading skeleton in the chip popover, a failed one the error block, and Retry shows the editor", async ({
  mount,
  page,
}) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const tag = await caller.tag.createTag({ input: createTagSchema.parse({ name: "Held" }) });
  const read = heldThenFailing();
  await routeTrpc(page, { ...serveCorpusProcedures(caller, SHELL_READS), ...serveCorpusProcedures(caller, ["tag.listTagsWithUsage"], read.intercept) });
  await mount<typeof EditableTagChipStory>(CHIP_STORY, { tags: [tag], appearance: appearanceSettingsSchema.parse({}) });
  await page.getByRole("button", { name: "Edit tag Held", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await read.hold.requested;
  await expect(dialog.locator('[aria-busy="true"]')).toBeVisible();
  read.hold.fail();
  await expect(dialog.getByText("Couldn't load this tag.", { exact: true })).toBeVisible();
  read.recover();
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByText("Couldn't load this tag.", { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Held");
});
