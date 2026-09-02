// The `--theme` readiness gate's shape (#1227). Its own contract module because the argv-heavy Args door
// (./types.ts) sits close to the tooling-size cap, and because this is the one thing the gate DECIDES:
// whether the stamp is predictable at all. The mechanism and both arms' reasons live in ops/theme-stamp.ts.
import type { EvidenceGap } from "../../_shared/evidence.ts";

/** What a run may assert about `<html data-theme>`: a value to WAIT for, or a named reason the stamp is
 *  not this instrument's to predict (a custom theme paints through <ThemeScope> and stamps nothing). */
export type ThemeStampExpectation =
  | { readonly kind: "gated"; readonly stamp: string; readonly themeName: string }
  | { readonly kind: "ungated"; readonly reason: string };

/** What the wait DID, not just what it concluded. `polls` is the number of times `<html data-theme>` was
 *  actually read: 0 is the receipt that an UNGATED arm returned without touching the page or the budget,
 *  and it is what a pin asserts instead of timing the call — wall-clock in a test body measures the box,
 *  not the instrument (Spine-Testing.md §3). */
export interface ThemeStampReceipt {
  /** Null when the stamp landed (or the arm was ungated); otherwise the refusal the run exits 2 on. */
  readonly gap: EvidenceGap | null;
  readonly polls: number;
}
