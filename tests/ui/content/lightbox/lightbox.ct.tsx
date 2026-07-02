import { Lightbox } from "@orb/ui/content";
import { expect, test } from "@playwright/experimental-ct-react";

const noop = (_open: boolean): void => undefined;

const EXTERNAL = ["https://cdn.example", ".test/z.png"].join("");

test("open renders the media through MessageMedia; the external gate still composes", async ({
  mount,
  page,
}) => {
  await mount(
    <Lightbox
      open={true}
      onOpenChange={noop}
      src={{ kind: "external", url: EXTERNAL }}
      media="image"
      alt="z"
    />,
  );
  // Dialog portals to the body — the gated placeholder (not a live external img) is what shows.
  await expect(page.locator('[data-slot="message-media-placeholder"]')).toBeVisible();
  expect(await page.locator(`img[src*="cdn.example"]`).count()).toBe(0);
});

test("closed renders nothing", async ({ mount, page }) => {
  await mount(
    <Lightbox
      open={false}
      onOpenChange={noop}
      src={{ kind: "asset", url: "/blob/a.png" }}
      media="image"
      alt="a"
    />,
  );
  expect(await page.locator('[data-slot="message-media"]').count()).toBe(0);
});
