import { expect, test } from "@playwright/test";
import { GALLERY_JITLESS_TEXT, GALLERY_READY_LABEL, GALLERY_READY_TEXT, GALLERY_RENDER_FAILURE, GALLERY_SCHEMA_LABEL } from "../iso/gallery-fixtures.ts";
import type { GalleryReadyStory, GalleryRenderFailureStory } from "./_gallery-stories.tsx";

const READY_STORY = "tests/support/browser/_gallery-stories/GalleryReadyStory";

test("unknown stories reject instead of passing an empty mount", async ({ mount }) => {
  await expect(mount<typeof GalleryReadyStory>("tests/support/browser/_gallery-stories/MissingStory")).rejects.toThrow("Unknown component story");
  const component = await mount<typeof GalleryReadyStory>(READY_STORY);
  const status = component.getByRole("status", { name: GALLERY_READY_LABEL, exact: true });
  await expect(status).toHaveText(GALLERY_READY_TEXT);
  await expect(status.locator("..")).toHaveCSS("order", "12");
  await expect(component.getByRole("status", { name: GALLERY_SCHEMA_LABEL, exact: true })).toHaveText(GALLERY_JITLESS_TEXT);
});

test("a React render failure rejects and leaves the next mount usable", async ({ mount }) => {
  await expect(mount<typeof GalleryRenderFailureStory>("tests/support/browser/_gallery-stories/GalleryRenderFailureStory")).rejects.toThrow(
    GALLERY_RENDER_FAILURE,
  );
  const component = await mount<typeof GalleryReadyStory>(READY_STORY);
  await expect(component.getByRole("status", { name: GALLERY_READY_LABEL, exact: true })).toHaveText(GALLERY_READY_TEXT);
  await component.unmount();
  await expect(component).toBeEmpty();
});
