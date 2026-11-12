// The announcement of the built-in's copy-on-write fork, over the `notify` seam: the fork happens off the person's sight
// (a library row they did not create, a pick that moved), so it is a toast and not an in-place status.
//
// Activation has no notice: the library's radio stays focused and reads checked, and the editor header's Active status takes
// focus, so the result is in sight (`docs/law/client-architecture-state-and-gates.md` §11, Toasts).

import { notify } from "#lib";

/** Announce the built-in's SILENT copy-on-write (side-eye 2026-08-30 P2-A, #856).
 *
 *  Editing the built-in mints an owned copy server-side, retargets the editor under the user and — when the
 *  built-in was the active pick — moves the pick to the copy. Measured, every one of those happened with no
 *  announcement at all, while the only status on screen read "Saved": three wrong beliefs in one act ("I
 *  changed Default", "my change is in effect", and a preset in the library nobody created). This rides the
 *  `notify` seam so one mechanism serves the eye and AT: the toast viewport is
 *  `aria-live="polite"`, and the fork gets no live region of its own.
 *
 *  TWO ARMS, because the sentence must not claim an activation that did not happen: the pick moves only when
 *  the built-in was what was active (`use-preset-autosave.ts`'s retarget owns that condition and reports it),
 *  and a fork made while some OTHER preset is active leaves generation where it was. Both arms end on the
 *  fact the user is most likely to have got wrong — the source is untouched. */
export function notifyBuiltInFork(forkName: string, sourceName: string, inheritedActivePick: boolean): void {
  notify.success(
    inheritedActivePick
      ? `Your edit created ${forkName} and it is now your active preset: ${sourceName} is unchanged.`
      : `Your edit created ${forkName}: ${sourceName} is unchanged.`,
  );
}
