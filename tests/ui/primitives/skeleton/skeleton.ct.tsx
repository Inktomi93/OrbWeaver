// CT: the skeleton seal — a muted pulse the caller sizes; the circle variant is square
// (ui-package-design §6.1).

import { Skeleton } from "@orb/ui/skeleton";
import { expect, test } from "@playwright/experimental-ct-react";

// --spacing-control-md is 3rem → 48px at the 16px root.
const CONTROL_MD_PX = 48;
const PULSE_CLASS = /animate-pulse/u;
const MUTED_CLASS = /bg-muted/u;

test("pulses on the muted token and takes the caller-supplied height", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="h-control-md w-full" />);
  await expect(skeleton).toHaveClass(PULSE_CLASS);
  await expect(skeleton).toHaveClass(MUTED_CLASS);
  const box = await skeleton.boundingBox();
  expect(Math.round(box?.height ?? 0)).toBe(CONTROL_MD_PX);
});

test("the circle variant renders a square (aspect-square)", async ({ mount }) => {
  const skeleton = await mount(<Skeleton className="w-control-md" variant="circle" />);
  const box = await skeleton.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(Math.round(box?.height ?? 0));
});
