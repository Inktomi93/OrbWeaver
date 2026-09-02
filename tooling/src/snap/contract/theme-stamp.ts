// The `--theme` readiness gate's shape (#1227). Its own contract module because the argv-heavy Args door
// (./types.ts) sits close to the tooling-size cap, and because this is the one thing the gate DECIDES:
// whether the stamp is predictable at all. The mechanism and both arms' reasons live in ops/theme-stamp.ts.

/** What a run may assert about `<html data-theme>`: a value to WAIT for, or a named reason the stamp is
 *  not this instrument's to predict (a custom theme paints through <ThemeScope> and stamps nothing). */
export type ThemeStampExpectation =
  | { readonly kind: "gated"; readonly stamp: string; readonly themeName: string }
  | { readonly kind: "ungated"; readonly reason: string };
