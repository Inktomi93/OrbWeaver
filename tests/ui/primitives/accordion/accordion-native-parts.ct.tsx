import { expect, test } from "@playwright/test";
import type { AccordionNativePartsStory } from "./accordion-native-parts-stories.tsx";

test("native headers contain disclosures; Tab skips disabled items and Enter switches the open panel", async ({ mount, page }) => {
  const component = await mount<typeof AccordionNativePartsStory>("tests/ui/primitives/accordion/accordion-native-parts-stories/AccordionNativePartsStory");
  const one = component.getByRole("heading", { name: "Section one", exact: true, level: 3 }).getByRole("button");
  const two = component.getByRole("heading", { name: "Section two", exact: true, level: 3 }).getByRole("button");
  await expect(one).toHaveAttribute("aria-expanded", "false");
  await one.click();
  await expect(one).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText("Body one", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Locked section", exact: true })).toBeDisabled();
  await expect(component.getByText("Locked body", { exact: true })).toBeHidden();
  await page.keyboard.press("Tab");
  await expect(two).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(two).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText("Body two", { exact: true })).toBeVisible();
  await expect(one).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByText("Body one", { exact: true })).toBeHidden();
  await page.keyboard.press("Space");
  await expect(two).toHaveAttribute("aria-expanded", "false");
  await expect(component.getByText("Body two", { exact: true })).toBeHidden();
});

test("multiple mode retains both panels until their own trigger closes them", async ({ mount }) => {
  const component = await mount<typeof AccordionNativePartsStory>("tests/ui/primitives/accordion/accordion-native-parts-stories/AccordionNativePartsStory", {
    multiple: true,
  });
  const one = component.getByRole("button", { name: "Section one", exact: true });
  const two = component.getByRole("button", { name: "Section two", exact: true });
  await one.click();
  await two.click();
  await expect(one).toHaveAttribute("aria-expanded", "true");
  await expect(two).toHaveAttribute("aria-expanded", "true");
  await expect(component.getByText("Body one", { exact: true })).toBeVisible();
  await expect(component.getByText("Body two", { exact: true })).toBeVisible();
  await one.click();
  await expect(one).toHaveAttribute("aria-expanded", "false");
  await expect(two).toHaveAttribute("aria-expanded", "true");
});
