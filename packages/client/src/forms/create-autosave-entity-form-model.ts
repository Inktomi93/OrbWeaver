// The autosave session's Node-without-DOM state model: lifecycle derivation and teardown predicates.
// Browser factory, render-prop and AppForm-derived contracts live at forms/editor/autosave-contract.ts.
// These helpers remain internal to the factory and are deliberately absent from the #forms barrel.

import type { RefObject } from "react";
import type { SAVE_LIFECYCLE_STATES } from "#state";
import { formValuesEqual } from "./entity-form-base.ts";
/** The autosave lifecycle the shared `AutosaveStatus` affordance renders (north-star §7 / D66 A4).
 *  DERIVED from the state-tier tuple (`SAVE_LIFECYCLE_STATES`) — the settings save-status store carries the
 *  same lifecycle and lives BELOW forms, so the tuple homes there and this alias derives rather than
 *  re-spells it (`no-inline-union-redecl`). */
export type AutosaveSaveState = (typeof SAVE_LIFECYCLE_STATES)[number];

/** Structural inequality of live values vs the last-saved baseline (§3) — the ONE unsaved-edit predicate the
 *  save driver, the clean-echo reseed, and the teardown flush share. NEVER `isDefaultValue` (permanently-true
 *  after any edit was the F2 write-back vector). Module-scope so no effect ever takes it as a dependency
 *  (D54: manual memo is banned, so an in-component definition would re-arm every render). */
export function hasUnsavedEdits<TValues extends object>(values: TValues, lastSaved: TValues): boolean {
  return !formValuesEqual(values, lastSaved);
}

/** The facts the displayed lifecycle folds together — one per reason the driver's own `saveState` can be a
 *  lie about this instant. Module-scope + an interface rather than five positional booleans, because the
 *  ORDER of the fold is the law (see `foldSaveState`) and a positional call site hides it. */
interface DisplayedSaveState {
  /** The driver's own lifecycle — what the last attempted write did. */
  readonly driver: AutosaveSaveState;
  /** `form.state.isValid` — false ⇒ the driver is deliberately holding this write. */
  readonly isValid: boolean;
  /** A DECLARED read-only mount that is nonetheless dirty — a write that will never be attempted. */
  readonly readOnlyDirty: boolean;
  /** `hasUnsavedEdits(values, lastSaved)` — an edit the driver has not yet written (the debounce window). */
  readonly unsaved: boolean;
  /** `SaveUnwritableContext` — the STORED row cannot be read, so the server refuses every write derived
   *  from this form and the driver never arms (#1716). Not a failure and not a held write: a fact about
   *  the row that no edit, retry or valid field can change. */
  readonly unwritable: boolean;
}

/**
 * THE DISPLAYED LIFECYCLE — the ONE derivation of "what is true about this form's persistence right now",
 * folded at the seam rather than at each call site (the same ruling as the `blocked` arm below: one
 * derivation, every autosave surface, no editor able to forget it).
 *
 * Order is the law, strongest fact about the WRITE first:
 *  0. `unreadable` — the stored row cannot be read, so NO write from this form can ever land (#1716). It
 *     outranks `error` because it explains it: the first refused save sets `error`, whose Retry cannot
 *     succeed, and offering that retry is the defect. Above `blocked` too — a valid field does not make
 *     this form writable.
 *  1. `error` — a save genuinely failed. It owns the retry affordance and outranks everything about what
 *     is in the box now.
 *  2. `blocked` — the driver is HOLDING this write (invalid form, or a declared read-only mount that got
 *     edited). "Not saved", with the reason living on the field.
 *  3. THE UNCOMMITTED EDIT (side-eye #81 P0) — the form carries text the driver has not written yet, i.e.
 *     the debounce window. Every editor read "Saved" here, over content that lived nowhere but in the box,
 *     and a tab closed inside that window loses it in silence (see the teardown note below: a page reload
 *     never unmounts React, so nothing flushes). It reads "saving": the pane is one armed debounce away
 *     from the write, which is exactly what "Saving…" means — the ratified three-state vocabulary, no
 *     fourth state minted (D78 §6), and the same mapping the Connections pane already made by hand.
 *
 * `unsaved` is `hasUnsavedEdits` against the SESSION-PRIVATE last-saved baseline, never `form.state.isDirty`
 * — TanStack's `isDirty` is permanently true after the first edit (the F2 trap this file warns about
 * throughout), so folding THAT here would pin every editor on "Saving…" forever. The baseline is why this
 * fold cannot live at a call site: `lastSavedRef` is the Session's own, and a consumer cannot compute it.
 */
export function foldSaveState({ driver, isValid, readOnlyDirty, unsaved, unwritable }: DisplayedSaveState): AutosaveSaveState {
  if (unwritable) {
    return "unreadable";
  }
  if (driver === "error") {
    return driver;
  }
  if (!isValid || readOnlyDirty) {
    return "blocked";
  }
  return driver === "saved" && unsaved ? "saving" : driver;
}

/** Read-and-clear the Boundary's discard flag — `true` = this teardown was a reseed and skips its flush.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function takeDiscard(discardRef: RefObject<boolean>): boolean {
  const discard = discardRef.current;
  discardRef.current = false;
  return discard;
}

/**
 * MUST THIS TEARDOWN SKIP ITS FLUSH? Two independent reasons, folded into one predicate so the Session's
 * cleanup stays one branch (`noExcessiveCognitiveComplexity` is a real ceiling on that component):
 *
 *  • a staged reseed/discard — the pre-reseed edit is dropped, never written back (the F2 write-back vector);
 *  • an UNWRITABLE subtree (#1716) — the stored row cannot be read, so the server refuses every write
 *    derived from it. A flush there is a guaranteed 400 fired from a component that has already unmounted,
 *    with no status left to report it. The `unreadable` status was the honest disclosure while the form was
 *    on screen.
 *
 * `takeDiscard` runs FIRST and unconditionally: the flag is read-and-clear, so short-circuiting past it
 * would leave a stale discard armed for the NEXT teardown, which would then silently drop a real edit.
 */
export function skipTeardownFlush(discardRef: RefObject<boolean>, unwritableRef: RefObject<boolean>): boolean {
  const discarded = takeDiscard(discardRef);
  return discarded || unwritableRef.current;
}
