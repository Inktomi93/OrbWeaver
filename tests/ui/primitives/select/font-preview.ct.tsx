// @subject packages/ui/src/primitives/select/select.tsx
// A label painted in the face it names declares that face, which the design audit reads; the trigger keeps its own face.
import { FONT_PREVIEW_ATTRIBUTE } from "@orb/ui/select/items";
import { expect, test } from "@playwright/test";
import type { FontPreviewSelectStory } from "./_font-preview-stories.tsx";

const STORY = "tests/ui/primitives/select/_font-preview-stories/FontPreviewSelectStory";

test("each option label declares the face it previews, and the closed trigger does not", async ({ mount, page }) => {
  const component = await mount<typeof FontPreviewSelectStory>(STORY);
  const trigger = component.getByRole("combobox", { name: "Body font", exact: true });
  await expect(trigger.locator(`[${FONT_PREVIEW_ATTRIBUTE}]`)).toHaveCount(0);
  await trigger.click();
  const options = page.getByRole("option");
  await expect(options).not.toHaveCount(0);
  for (const option of await options.all()) {
    const label = option.locator(`[${FONT_PREVIEW_ATTRIBUTE}]`);
    const face = (await option.textContent())?.trim() ?? "";
    await expect(label).toHaveAttribute(FONT_PREVIEW_ATTRIBUTE, face);
    expect(await label.evaluate((node) => getComputedStyle(node).fontFamily)).toBe(face);
  }
});
