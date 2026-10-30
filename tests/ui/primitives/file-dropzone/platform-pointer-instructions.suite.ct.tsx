// The dropzone's instruction line follows the pointer class: one spelling is shown per class and the other leaves
// layout and the accessibility tree, with or without a subject.
import { expect, test } from "@playwright/test";
import type { PointerInstructionsStory } from "./_pointer-instructions-stories.tsx";

const STORY = "tests/ui/primitives/file-dropzone/_pointer-instructions-stories/PointerInstructionsStory";
const SUBJECTS = [undefined, "a preset .json"] as const;

test.describe("a fine pointer", () => {
  test.use({ hasTouch: false, isMobile: false });
  for (const subject of SUBJECTS) {
    test(`is told to drop or click${subject === undefined ? "" : ", with a subject"}`, async ({ mount }) => {
      const component = await mount<typeof PointerInstructionsStory>(STORY, subject === undefined ? {} : { subject });
      await expect(component.locator('[data-pointer="fine"]')).toBeVisible();
      await expect(component.locator('[data-pointer="coarse"]')).toBeHidden();
    });
  }
});

test.describe("a coarse pointer", () => {
  test.use({ hasTouch: true, isMobile: true });
  for (const subject of SUBJECTS) {
    test(`is told to tap${subject === undefined ? "" : ", with a subject"}`, async ({ mount }) => {
      const component = await mount<typeof PointerInstructionsStory>(STORY, subject === undefined ? {} : { subject });
      await expect(component.locator('[data-pointer="coarse"]')).toBeVisible();
      await expect(component.locator('[data-pointer="fine"]')).toBeHidden();
    });
  }
});
