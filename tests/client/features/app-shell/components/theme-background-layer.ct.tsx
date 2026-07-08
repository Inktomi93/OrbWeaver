// CT: `ThemeBackgroundLayer` (D63/Phase-4b) — the fixed-position decorative-photo root layer. Pins the
// file-header invariants at COMPUTED style, not just source text (done-not-equal-rendered):
//   • `fit` drives `background-size` (cover/contain).
//   • NEVER `background-attachment: fixed` — the component uses `position:fixed` (Tailwind `fixed`
//     class) on the element itself, never the CSS `background-attachment` property, so the computed
//     property must read the browser default "scroll".
//   • `dim` maps 1:1 to the scrim's computed `opacity`.
//   • `blur` lands as `filter: blur(<n>px)` on the PHOTO only; the scrim carries no filter ("none").
//   • `url={null}` renders nothing (both slots absent).

import { expect, test } from "@playwright/experimental-ct-react";
import { ThemeBackgroundLayer } from "../../../../../packages/client/src/features/app-shell/components/theme-background-layer";

const PHOTO = '[data-slot="theme-background-layer"]';
const SCRIM = '[data-slot="theme-background-scrim"]';

test("fit=cover sets background-size: cover", async ({ mount, page }) => {
  await mount(<ThemeBackgroundLayer blur={8} dim={0.4} fit="cover" url="/fake.jpg" />);
  await expect(page.locator(PHOTO)).toHaveCSS("background-size", "cover");
});

test("fit=contain sets background-size: contain", async ({ mount, page }) => {
  await mount(<ThemeBackgroundLayer blur={8} dim={0.4} fit="contain" url="/fake.jpg" />);
  await expect(page.locator(PHOTO)).toHaveCSS("background-size", "contain");
});

test("never background-attachment: fixed (position:fixed, not bg-attachment)", async ({
  mount,
  page,
}) => {
  await mount(<ThemeBackgroundLayer blur={0} dim={0.4} fit="cover" url="/fake.jpg" />);
  const photo = page.locator(PHOTO);
  await expect(photo).toHaveCSS("background-attachment", "scroll");
  await expect(photo).toHaveCSS("position", "fixed");
});

test("dim maps 1:1 to the scrim's computed opacity", async ({ mount, page }) => {
  await mount(<ThemeBackgroundLayer blur={0} dim={0.4} fit="cover" url="/fake.jpg" />);
  await expect(page.locator(SCRIM)).toHaveCSS("opacity", "0.4");
});

test("blur lands as filter:blur(<n>px) on the photo; the scrim carries no filter", async ({
  mount,
  page,
}) => {
  await mount(<ThemeBackgroundLayer blur={8} dim={0.4} fit="cover" url="/fake.jpg" />);
  await expect(page.locator(PHOTO)).toHaveCSS("filter", "blur(8px)");
  await expect(page.locator(SCRIM)).toHaveCSS("filter", "none");
});

test("url=null renders nothing — neither slot is present", async ({ mount, page }) => {
  await mount(<ThemeBackgroundLayer blur={8} dim={0.4} fit="cover" url={null} />);
  await expect(page.locator(PHOTO)).toHaveCount(0);
  await expect(page.locator(SCRIM)).toHaveCount(0);
});
