// A phone has no Escape key, so the lightbox carries its own visible close control.
import { expect, test } from "@playwright/test";
import { LIGHTBOX_LABELS } from "../../../../packages/ui/src/content/lightbox/control-labels.ts";
import type { LightboxCloseStory } from "./_lightbox-stories.tsx";

test("the lightbox closes from its visible close control", async ({ mount, page }) => {
  await mount<typeof LightboxCloseStory>("tests/ui/content/lightbox/_lightbox-stories/LightboxCloseStory", {});
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: LIGHTBOX_LABELS.close, exact: true }).click();
  await expect(dialog).toBeHidden();
});
