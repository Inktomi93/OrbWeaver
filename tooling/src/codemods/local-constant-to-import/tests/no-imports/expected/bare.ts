

import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";

export const near = (a: number, b: number): boolean => Math.abs(a - b) <= LAYOUT_SUBPIXEL_PX;
