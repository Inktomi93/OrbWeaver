// CT: the card surface seal — the card token surface, padding variants that differ, and the
// interactive clickable affordance (ui-package-design §6.1).

import { Card } from "@orb/ui/card";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

// --spacing-section is 1.5rem → 24px; padding="none" resets to 0.
const SECTION_PX = 24;
const NONE_PX = 0;

test("is the card token surface", async ({ mount }) => {
  const card = await mount(<Card>Panel</Card>);
  await expect(card).toHaveCSS("background-color", TOKENS["color.card"].value);
});

test("padding variants differ (none resets, section pads on the token scale)", async ({
  mount,
}) => {
  const none = await mount(<Card padding="none">Panel</Card>);
  const nonePad = await none.evaluate((el) => getComputedStyle(el).paddingTop);
  expect(Math.round(Number.parseFloat(nonePad))).toBe(NONE_PX);
  await none.unmount();
  const section = await mount(<Card padding="section">Panel</Card>);
  const sectionPad = await section.evaluate((el) => getComputedStyle(el).paddingTop);
  expect(Math.round(Number.parseFloat(sectionPad))).toBe(SECTION_PX);
});

test("interactive adds the pointer affordance", async ({ mount }) => {
  const card = await mount(<Card interactive={true}>Panel</Card>);
  const cursor = await card.evaluate((el) => getComputedStyle(el).cursor);
  expect(cursor).toBe("pointer");
});
