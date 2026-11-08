// A file with no import statement still gets the binding it now uses.
const EPSILON = 1;

export const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPSILON;
