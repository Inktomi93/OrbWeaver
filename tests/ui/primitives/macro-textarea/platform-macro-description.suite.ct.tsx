import { expect, test } from "@playwright/test";
import type { MacroDescriptionCompositionStory } from "./_macro-description-stories.tsx";

test.use({ viewport: { width: 960, height: 900 }, hasTouch: false, isMobile: false });

test("macro helper descriptions preserve caller and registered Field descriptions without changing the label", async ({ mount }) => {
  const component = await mount<typeof MacroDescriptionCompositionStory>(
    "tests/ui/primitives/macro-textarea/_macro-description-stories/MacroDescriptionCompositionStory",
  );
  const control = component.getByRole("textbox", { name: "Arrival", exact: true });
  await component.getByText("Arrival", { exact: true }).click();
  await expect(control).toBeFocused();
  await expect(control).toHaveAccessibleName("Arrival");
  await expect(control).toHaveAccessibleDescription("Authoring context from the caller. Live macro helper. Registered field guidance.");
  await component.getByRole("button", { name: "Hide helper", exact: true }).click();
  await expect(component.locator('[data-slot="macro-textarea-helper"]')).toHaveCount(0);
  await expect(control).toHaveAccessibleDescription("Authoring context from the caller. Registered field guidance.");
  await expect(control).toHaveAccessibleName("Arrival");
  await expect(control).toHaveValue("A traveler arrives.");
});
