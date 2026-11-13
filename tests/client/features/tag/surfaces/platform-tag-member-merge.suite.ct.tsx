import { ALERTS_REGION_NAME, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import {
  mergeTagLegend,
  TAG_EDITOR_NAME_FIELD_NAME,
  TAG_MERGE_CONFIRM_NAME,
  TAG_MERGE_DOOR_NAME,
  TAG_MERGE_FAILED_TOAST,
  TAG_MERGE_TARGET_NAME,
} from "#client/components/shared-control-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { TagMemberStory } from "./_tag-member-stories.tsx";

for (const viewport of [
  { name: "desktop", width: 1280, height: 900, hasTouch: false },
  { name: "phone", width: 390, height: 844, hasTouch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });
    test("the member host keeps merge explicit and returns focus on Cancel and Escape after failure", async ({ page, mount }) => {
      const press = (control: Locator): Promise<void> => (viewport.hasTouch ? control.tap() : control.click());
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const tag = await caller.tag.createTag({ input: { name: "Member source" } });
      const target = await caller.tag.createTag({ input: { name: "Member target" } });
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "tag.listTagsWithUsage", "tag.listPendingSuggestions"]),
        ...serveCorpusProcedures(caller, ["tag.mergeTags"], () => trpcError()),
      });
      await mount<typeof TagMemberStory>("tests/client/features/tag/surfaces/_tag-member-stories/TagMemberStory", { tagId: tag.id });
      const trigger = page.getByRole("button", { name: TAG_MERGE_DOOR_NAME, exact: true });
      await press(trigger);
      const group = page.getByRole("group", { name: mergeTagLegend(tag.name), exact: true });
      await expect(group.getByRole("button", { name: TAG_MERGE_CONFIRM_NAME, exact: true })).toBeDisabled();
      await press(group.getByRole("combobox", { name: TAG_MERGE_TARGET_NAME, exact: true }));
      await press(page.getByRole("option", { name: target.name, exact: true }));
      await press(group.getByRole("button", { name: TAG_MERGE_CONFIRM_NAME, exact: true }));
      await expect(page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByText(TAG_MERGE_FAILED_TOAST, { exact: true })).toBeVisible();
      await expect(group).toBeVisible();
      await press(group.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }));
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(group.getByRole("combobox", { name: TAG_MERGE_TARGET_NAME, exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(group).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(page.getByRole("textbox", { name: TAG_EDITOR_NAME_FIELD_NAME, exact: true })).toHaveValue(tag.name);
      expect((await caller.tag.listTagsWithUsage()).find((row) => row.id === tag.id)?.name).toBe(tag.name);
    });
  });
}
