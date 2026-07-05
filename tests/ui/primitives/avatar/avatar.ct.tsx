import { Avatar } from "@orb/ui/avatar";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const SVG_MARKUP =
  "<svg xmlns='http://www.w3.org/2000/svg' width='2' height='2'><rect width='2' height='2'/></svg>";
const TINY_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(SVG_MARKUP)}`;

// avatar-lg is authored in rem; the rendered box resolves to px (root = 16px — the stack.ct precedent).
const ROOT_PX = 16;
const avatarLgPx = Math.round(Number.parseFloat(TOKENS["spacing.avatar-lg"].value) * ROOT_PX);

test("renders the image when it loads", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Nate" src={TINY_SVG}>
      NT
    </Avatar>,
  );

  await expect(page.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect(page.locator('[data-slot="avatar-fallback"]')).toBeHidden();
});

test("falls back to initials when the image fails to load", async ({ mount, page }) => {
  await mount(
    <Avatar alt="Nate" src="/definitely-not-a-real-image.png">
      NT
    </Avatar>,
  );

  const fallback = page.locator('[data-slot="avatar-fallback"]');
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveText("NT");
  await expect(page.locator('[data-slot="avatar-image"]')).toBeHidden();
});

test("falls back when no image source is given", async ({ mount, page }) => {
  await mount(<Avatar alt="Nate">NT</Avatar>);

  await expect(page.locator('[data-slot="avatar-fallback"]')).toHaveText("NT");
  await expect(page.locator('[data-slot="avatar-image"]')).toHaveCount(0);
});

test("shape variants map to the radius tokens", async ({ mount, page }) => {
  await mount(<Avatar alt="Round avatar">R</Avatar>);
  const root = page.locator('[data-slot="avatar-root"]');
  // round (default) = --radius-full
  await expect(root).toHaveCSS("border-radius", "9999px");
});

test("square shape uses the control radius token; size rides the DISPLAY-avatar token (D62 rewire)", async ({
  mount,
  page,
}) => {
  await mount(
    <Avatar alt="Square avatar" shape="square" size="lg">
      S
    </Avatar>,
  );
  const root = page.locator('[data-slot="avatar-root"]');
  // square = --radius-control (0.375rem = 6px)
  await expect(root).toHaveCSS("border-radius", "6px");
  // lg = --spacing-avatar-lg (2.125rem = 34px) — DECOUPLED from the control tokens (was 56px control-lg).
  await expect(root).toHaveCSS("width", `${avatarLgPx}px`);
});

// Every rendered fallback's background-color in one read (no await-in-loop).
const FALLBACK = '[data-slot="avatar-fallback"]';
const readBackgrounds = (els: Element[]): string[] =>
  els.map((el) => getComputedStyle(el).backgroundColor);

test("the fallback hue is DETERMINISTIC per seed and spreads across the ramp (D62)", async ({
  mount,
  page,
}) => {
  // Two avatars with the SAME seed (indices 0,1) + four distinct seeds — mounted together so a single
  // read compares them without a loop.
  await mount(
    <div>
      <Avatar hueSeed="Wren Calloway">WC</Avatar>
      <Avatar hueSeed="Wren Calloway">WC</Avatar>
      <Avatar hueSeed="The Cartographer">TC</Avatar>
      <Avatar hueSeed="Saria Vex">SV</Avatar>
      <Avatar hueSeed="Inkfell">IF</Avatar>
      <Avatar hueSeed="Captain Mott">CM</Avatar>
    </div>,
  );
  const bgs = await page.locator(FALLBACK).evaluateAll(readBackgrounds);
  // Same seed → identical color (stable per identity).
  expect(bgs[0]).toBe(bgs[1]);
  // Distinct seeds spread across more than one hue (the hash mixes — not a constant).
  expect(new Set(bgs).size).toBeGreaterThan(1);
});

test("hueSeed defaults to alt — a missing seed still colors the fallback stably by name", async ({
  mount,
  page,
}) => {
  // Left relies on the alt default; right passes hueSeed === alt explicitly — same resolved hue.
  await mount(
    <div>
      <Avatar alt="Saria Vex">SV</Avatar>
      <Avatar alt="Saria Vex" hueSeed="Saria Vex">
        SV
      </Avatar>
    </div>,
  );
  const bgs = await page.locator(FALLBACK).evaluateAll(readBackgrounds);
  expect(bgs[0]).toBe(bgs[1]);
});
