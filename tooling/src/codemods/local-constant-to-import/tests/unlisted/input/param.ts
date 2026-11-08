// A parameter of the same name is a different variable: a rename would turn it into a syntax error.
const EPSILON = 1;

export const near = (a: number, EPSILON: number): boolean => a <= EPSILON;
export const arrow = (a: number): boolean => [a].some((EPSILON) => EPSILON > 0) && a > EPSILON;
