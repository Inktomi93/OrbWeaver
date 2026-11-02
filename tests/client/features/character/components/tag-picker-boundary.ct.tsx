// @subject packages/client/src/components/tag-picker-dialog.tsx
// The tag picker dialog reads the tag library through the shared boundary only while open: a held read shows the loading skeleton, a failed one
// the shared error block, and Retry shows the picker field.

import { createTagSchema } from "@orb/contracts/tag";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import { TAG_NAME_FIELD_NAME } from "#client/components/shared-control-names.ts";
import { CHARACTER_ADD_TAG_NAME } from "#client/features/character/lib/character-names.ts";
import type { CharacterTagsRowStory } from "./_tag-row-stories.tsx";

const ROW_STORY = "tests/client/features/character/components/_tag-row-stories/CharacterTagsRowStory";
const SHELL_READS = ["sessions.me", "settings.getUserSettings"] as const;

type Held = ReturnType<typeof holdServed>;

function heldThenFailing(): { readonly hold: Held; readonly intercept: () => Held | ReturnType<typeof trpcError> | undefined; readonly recover: () => void } {
  const hold = holdServed();
  let held = false;
  let failing = true;
  return {
    hold,
    intercept: (): Held | ReturnType<typeof trpcError> | undefined => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    },
    recover: (): void => {
      failing = false;
    },
  };
}

test("a held tag library read shows the loading skeleton in the tag picker, a failed one the error block, and Retry shows the field", async ({
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
  read.hold.fail();
  await expect(dialog.getByText("Couldn't load your tags.", { exact: true })).toBeVisible();
  read.recover();
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: TAG_NAME_FIELD_NAME })).toBeVisible();
});
