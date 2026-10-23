export type Mixed = "a" | 1;
export type Single = "only";
export type Generic<T> = "a" | "b";
export type Derived = (typeof LIST)[number];
export const LIST = ["a"] as const;
export function f(): void {
  type Inner = "x" | "y";
  const v: Inner = "x";
  return void v;
}
