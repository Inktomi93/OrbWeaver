// CT: the badge/chip/pill seal — intent maps to the status token PAIR (computed color), sizes
// carry real padding (ui-package-design §6.1).

import { Badge } from "@orb/ui/badge";
import { expect, test } from "@playwright/experimental-ct-react";

test("default intent is the neutral (muted) token background", async ({ mount }) => {
  const badge = await mount(<Badge>Draft</Badge>);
  const background = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toContain("oklch(0.255 0.012 65)");
});

test("success intent lands as the success token background", async ({ mount }) => {
  const badge = await mount(<Badge intent="success">Active</Badge>);
  const background = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toContain("oklch(0.72 0.13 150)");
});

test("danger intent swaps to the destructive token", async ({ mount }) => {
  const badge = await mount(<Badge intent="danger">Failed</Badge>);
  const background = await badge.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).toContain("oklch(0.62 0.19 25)");
});

test("md size carries more horizontal padding than sm", async ({ mount }) => {
  const small = await mount(<Badge size="sm">Tag</Badge>);
  const smallPad = await small.evaluate((el) => getComputedStyle(el).paddingLeft);
  await small.unmount();
  const medium = await mount(<Badge size="md">Tag</Badge>);
  const mediumPad = await medium.evaluate((el) => getComputedStyle(el).paddingLeft);
  expect(Number.parseFloat(mediumPad)).toBeGreaterThan(Number.parseFloat(smallPad));
});
