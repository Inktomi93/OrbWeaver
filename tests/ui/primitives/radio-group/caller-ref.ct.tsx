import { expect, test } from "@playwright/test";
import type { RadioRefStory } from "./_ref-stories.tsx";

test("a caller ref preserves the group's internal controlled-focus handling", async ({ mount, page }) => {
  const root = await mount<typeof RadioRefStory>("tests/ui/primitives/radio-group/_ref-stories/RadioRefStory");
  const group = page.getByRole("radiogroup", { name: "Controlled radios", exact: true });
  const outside = page.getByRole("button", { name: "Focus group through caller ref", exact: true });
  await outside.click();
  await expect(group).toBeFocused();
  const alpha = group.getByRole("radio", { name: "Alpha", exact: true });
  const beta = group.getByRole("radio", { name: "Beta", exact: true });
  await alpha.focus();
  await root.update({ value: "beta" });
  await expect(beta).toBeChecked();
  await expect(alpha).toBeFocused();
  await outside.focus();
  await root.update({ value: "alpha" });
  await expect(alpha).toBeChecked();
  await root.update({ value: "beta" });
  await page.keyboard.press("Tab");
  await expect(beta).toBeFocused();
  await expect(beta).toBeChecked();
});
