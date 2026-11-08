import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";

// The binding is already imported, so no second import line is added.
const EPSILON = 1;

export const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON + LAYOUT_SUBPIXEL_PX;
