// Not in the plan's file list, so its own constant stays.
const EPSILON = 1;

export const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;
