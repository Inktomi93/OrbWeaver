import { Avatar } from "@orb/ui/avatar";
import { expect, test } from "@playwright/experimental-ct-react";

const SVG_MARKUP =
  "<svg xmlns='http://www.w3.org/2000/svg' width='2' height='2'><rect width='2' height='2'/></svg>";
const TINY_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(SVG_MARKUP)}`;

test("renders the image when it loads", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Alex" src={TINY_SVG}>
      NT
    </Avatar>,
  );

  await expect(page.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect(page.locator('[data-slot="avatar-fallback"]')).toBeHidden();
});

test("falls back to initials when the image fails to load", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Alex" src="/definitely-not-a-real-image.png">
      NT
    </Avatar>,
  );

  const fallback = page.locator('[data-slot="avatar-fallback"]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText("NT");
  await expect(page.locator('[data-slot="avatar-image"]')).toBeHidden();
});

test("falls back when no image source is given", async ({ mount, page }) => {
  await mount(<Avatar alt="Alex">NT</Avatar>);

  await expect(page.locator('[data-slot="avatar-fallback"]')).toHaveText("NT");
  await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);
});

test("shape variants map to the radius tokens", async ({ mount, page }) => {
  await mount(<Avatar alt="Round avatar">R</Avatar>);
  const root = page.locator('[data-slot="avatar-root"]');
  // round (default) = --radius-full
  await expect(root).toHaveCSS("border-radius", "9999px");
});

test("square shape uses the control radius token", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Square avatar" shape="square" size="lg">
      S
    </Avatar>,
  );
  const root = page.locator('[data-slot="avatar-root"]');
  // square = --radius-control (0.375rem = 6px)
  await expect(root).toHaveCSS("border-radius", "6px");
  // lg = --spacing-control-lg (3.5rem = 56px)
  await expect(root).toHaveCSS("width", "56px");
});
