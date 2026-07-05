// createSavedEntityForm CT — pins `promote()`'s `dontUpdateMeta: true` meta-preservation guarantee
// (create-saved-entity-form.ts `promote()`) through the REAL factory-exported hook, not just the
// raw FormApi call it wraps (the headless `create-saved-entity-form.test.ts` sibling pins that
// underlying library contract; this closes the gap to the actual `promote()` wrapper). A browser/CT
// lane (not headless) because `form.Subscribe` needs a real render to observe `isDirty` reactively
// (core/Spine-Testing.md §7).

import { expect, test } from "@playwright/experimental-ct-react";
import { SavedEntityPromoteStory } from "./_ct-stories";

test("promote() with dontUpdateMeta keeps the form's isDirty false", async ({ mount, page }) => {
  await mount(<SavedEntityPromoteStory />);

  const isDirtyState = page.getByTestId("promote-story-is-dirty");
  await expect(isDirtyState).toHaveText("false");

  await page.getByRole("button", { name: "promote avatarAssetId" }).click();

  // THE PIN: promote() is a mount-time NON-USER write — it must change the underlying value (a
  // regular setFieldValue call would flip isDirty here) WITHOUT ever flipping isDirty.
  await expect(isDirtyState).toHaveText("false");
});
