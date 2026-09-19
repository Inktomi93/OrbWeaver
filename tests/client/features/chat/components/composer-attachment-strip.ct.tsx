// CT: the pending composer strip's own contract — empty means no strip, image/video MIME selects the
// matching preview element, and each remove affordance preserves the attachment's array index.

import { removeActionName } from "@orb/client/lib";
import { expect, test } from "@playwright/experimental-ct-react";
import { ComposerAttachmentStripStory } from "../_ct-stories.tsx";

test("an empty attachment list renders no strip", async ({ mount }) => {
  const component = await mount(<ComposerAttachmentStripStory empty={true} />);
  await expect(component.locator('[data-slot="composer-attachments"]')).toHaveCount(0);
});

test("image and video files render their matching previews with named remove controls", async ({ mount }) => {
  const component = await mount(<ComposerAttachmentStripStory />);

  await expect(component.getByAltText("Attachment preview: portrait.png")).toBeVisible();
  const video = component.locator("video");
  await expect(video).toHaveCount(1);
  await expect(video).toBeVisible();
  await expect(component.getByRole("button", { name: removeActionName("portrait.png") })).toBeVisible();
  await expect(component.getByRole("button", { name: removeActionName("scene.mp4") })).toBeVisible();
});

test("remove callbacks carry the attachment's current index", async ({ mount }) => {
  const component = await mount(<ComposerAttachmentStripStory />);

  await component.getByRole("button", { name: removeActionName("scene.mp4") }).click();
  await expect(component.getByTestId("removed-index")).toHaveText("1");

  await component.getByRole("button", { name: removeActionName("portrait.png") }).click();
  await expect(component.getByTestId("removed-index")).toHaveText("0");
});
