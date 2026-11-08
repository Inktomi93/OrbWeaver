import { other } from "./other.ts";

/** The first-paint height guess. */
// Rows re-measure after mount.
const ESTIMATED_ROW_PX = 44;
const EPSILON = 1;

export const size = (): number => ESTIMATED_ROW_PX + other;
export const estimate = { height: ESTIMATED_ROW_PX, near: (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON };
