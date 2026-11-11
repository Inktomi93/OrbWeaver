/** Homed as a tuple and DERIVED (`orb/no-inline-union-alias`), so a new member fails `tsc`. */
const SHAPES = ["line", "avatar-row", "datum"] as const;
// Declared ONCE as an `as const` tuple, the union derived (§7.5 orb/no-inline-union-alias).
export type Shape = (typeof SHAPES)[number];
// A longer name stays: no-inline-union-redecl-arm-b.
export const RULE = "no-inline-union-redecl";
