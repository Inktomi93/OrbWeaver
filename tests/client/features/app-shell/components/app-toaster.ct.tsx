import { expect, test } from "@playwright/experimental-ct-react";
import { AppShellToastOverlayStory } from "../_ct-stories.tsx";

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 360, height: 780 },
]) {
  test.describe(`toast overlay at ${viewport.width}`, () => {
    test.use({ viewport, hasTouch: viewport.width === 360 });

    test("raising a toast preserves content and composer geometry", async ({ mount, page }) => {
      await mount(<AppShellToastOverlayStory />);
      const content = page.getByTestId("band-content-pane");
      const composer = page.getByTestId("band-composer-standin");
      const raise = page.getByTestId("raise-notice");
      // The fixture's trigger follows the viewport-sized shell; settle its scroll before measuring layout.
      await raise.scrollIntoViewIfNeeded();
      await expect(content).toBeVisible();
      let previousGeometry: string | undefined;
      await expect
        .poll(async () => {
          const geometry = JSON.stringify([await content.boundingBox(), await composer.boundingBox()]);
          const settled = geometry === previousGeometry;
          previousGeometry = geometry;
          return settled;
        })
        .toBe(true);
      const beforeContent = await content.boundingBox();
      const beforeComposer = await composer.boundingBox();
      await expect.poll(() => content.boundingBox()).not.toBeNull();
      await expect.poll(() => composer.boundingBox()).not.toBeNull();
      await raise.click();
      await expect(page.locator('[data-slot="toast-root"]')).toBeVisible();
      await expect.poll(() => content.boundingBox()).toEqual(beforeContent);
      await expect.poll(() => composer.boundingBox()).toEqual(beforeComposer);
      await expect(page.locator('[data-slot="toast-viewport"]')).toHaveCSS("position", "fixed");
    });
  });
}
