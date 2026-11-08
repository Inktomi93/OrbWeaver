// A listed file whose name is redeclared in an inner scope is left whole: a rename would reach the shadowing declaration.
const EPSILON = 1;

export const near = (a: number, b: number): boolean => {
  const EPSILON = 2;
  return Math.abs(a - b) <= EPSILON;
};
export const far = (a: number): boolean => a > EPSILON;
