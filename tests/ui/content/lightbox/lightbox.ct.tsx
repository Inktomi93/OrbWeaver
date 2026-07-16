import { Lightbox } from "@orb/ui/lightbox";
import { expect, test } from "@playwright/experimental-ct-react";
import { LightboxHarness } from "./lightbox.fixtures";

const noop = (_open: boolean): void => undefined;

const EXTERNAL = ["https://cdn.example", ".test/z.png"].join("");

test("open renders the media through MessageMedia; the external gate still composes", async ({ mount, page }) => {
  await mount(<Lightbox open={true} onOpenChange={noop} src={{ kind: "external", url: EXTERNAL }} media="image" alt="z" />);
  // Dialog portals to the body — the gated placeholder (not a live external img) is what shows.
  await expect(page.locator('[data-slot="message-media-placeholder"]')).toBeVisible();
  expect(await page.locator(`img[src*="cdn.example"]`).count()).toBe(0);
});

test("closed renders nothing", async ({ mount, page }) => {
  await mount(<Lightbox open={false} onOpenChange={noop} src={{ kind: "asset", url: "/blob/a.png" }} media="image" alt="a" />);
  expect(await page.locator('[data-slot="message-media"]').count()).toBe(0);
});

test("focus trap + Escape + focus-return-to-trigger (inherited from Dialog)", async ({ mount, page }) => {
  await mount(<LightboxHarness />);
  const trigger = page.getByRole("button", { name: "Open lightbox" });
  await trigger.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Focus trap: Tab from inside the popup never escapes back to the trigger sitting behind it.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focusInsideDialog = await dialog.evaluate((node) => node.contains(document.activeElement));
  expect(focusInsideDialog).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Focus-return-to-trigger: Base UI's Dialog restores focus to whatever was focused pre-open.
  await expect(trigger).toBeFocused();
});
