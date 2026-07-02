// CT: the button seal — token variants land as computed style, sizes hold the touch floor,
// loading is a real disabled+aria-busy state (ui-package-design §6.1).

import { Button } from "@orb/ui/button";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";

const TOUCH_FLOOR_PX = 44;

test("primary intent lands as the primary token background", async ({ mount }) => {
  const button = await mount(<Button>Save</Button>);
  await expect(button).toHaveCSS("background-color", TOKENS["color.primary"].value);
});

test("destructive intent swaps to the destructive token", async ({ mount }) => {
  const button = await mount(<Button intent="destructive">Delete</Button>);
  await expect(button).toHaveCSS("background-color", TOKENS["color.destructive"].value);
});

test("every size meets the 44px touch floor; lg is taller than sm", async ({ mount }) => {
  const small = await mount(<Button size="sm">Save</Button>);
  const smallBox = await small.boundingBox();
  expect(smallBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  await small.unmount();
  const large = await mount(<Button size="lg">Save</Button>);
  const largeBox = await large.boundingBox();
  expect(largeBox?.height).toBeGreaterThanOrEqual(TOUCH_FLOOR_PX);
  expect(largeBox?.height ?? 0).toBeGreaterThan(smallBox?.height ?? 0);
});

test("loading sets aria-busy and disables the button", async ({ mount }) => {
  const button = await mount(<Button loading={true}>Save</Button>);
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(button).toBeDisabled();
});
