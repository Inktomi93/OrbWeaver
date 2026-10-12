// The saved-editor factory's invalid-submit focus contract. This must ride a real submission through
// TanStack validation: calling focusFirstInvalidField directly would only test the helper in isolation.

import { expect, test } from "@playwright/experimental-ct-react";
import { InvalidFocusSavedFormStory } from "./_focus-invalid-field-stories.tsx";

test("an invalid submit focuses the first invalid bound control", async ({ mount, page }) => {
  await mount(<InvalidFocusSavedFormStory />);

  const first = page.getByRole("textbox", { name: "Name" });
  const second = page.getByRole("textbox", { name: "Summary" });
  await second.focus();
  await expect(second).toBeFocused();

  await page.getByRole("button", { name: "Save" }).click();

  await expect(first).toHaveAttribute("aria-invalid", "true");
  await expect(second).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("A name is required.")).toBeVisible();
  await expect(page.getByText("A summary is required.")).toBeVisible();
  await expect(first).toBeFocused();
});
