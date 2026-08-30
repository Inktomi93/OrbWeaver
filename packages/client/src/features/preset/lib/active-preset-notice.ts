// The ONE announcement of an activation — the sentence AND the channel, single-homed for the two writers of
// the `setDefault` seeds patch (the LIST row's radio, `preset-library-surface.tsx`, and the editor header's
// Activate, `preset-editor-surface.tsx`). Same shape as chat's `notifyImpersonateFailure`: a feature-local
// notice function over the `notify` seam, never a toast lib and never a second sentence.
//
// WHY IT EXISTS (side-eye 2026-08-22 P1-1, issue #481). Activation changes what EVERY future generation
// does, and it had no feedback at all: no confirm, no undo, no toast, no live region — the only signal was a
// dot moving in a list the user may not be looking at, while Delete on the same row gets a full alertdialog.
// `notify` is the mechanism rather than a bespoke sr-only region because it is ONE mechanism serving both
// readings: the toast viewport is `aria-live="polite"`, so the sentence is announced to AT and painted for
// the eye in the same act, and both writers get it without either owning a live region of its own.
//
// A TITLE-ONLY NOTICE, deliberately: "<name> is now the active preset" is the whole fact, and `notify`'s own
// contract says a title-only notice is exactly a notice with nothing more to say.

import { notify } from "#lib";

/** Announce the new active-for-generation preset. `name` is the row's own name as the user sees it. */
export function notifyActivePreset(name: string): void {
  notify.success(`${name} is now the active preset`);
}

/** Announce the built-in's SILENT copy-on-write (side-eye 2026-08-30 P2-A, #856).
 *
 *  Editing the built-in mints an owned copy server-side, retargets the editor under the user and — when the
 *  built-in was the active pick — moves the pick to the copy. Measured, every one of those happened with no
 *  announcement at all, while the only status on screen read "Saved": three wrong beliefs in one act ("I
 *  changed Default", "my change is in effect", and a preset in the library nobody created). This rides the
 *  SAME `notify` seam as `notifyActivePreset` for the same reason it does — the toast viewport is
 *  `aria-live="polite"`, so one mechanism serves the eye and AT, and the fork gets no live region of its own.
 *
 *  TWO ARMS, because the sentence must not claim an activation that did not happen: the pick moves only when
 *  the built-in was what was active (`use-preset-autosave.ts`'s retarget owns that condition and reports it),
 *  and a fork made while some OTHER preset is active leaves generation where it was. Both arms end on the
 *  fact the user is most likely to have got wrong — the source is untouched. */
export function notifyBuiltInFork(forkName: string, sourceName: string, inheritedActivePick: boolean): void {
  notify.success(
    inheritedActivePick
      ? `Your edit created ${forkName} and it is now your active preset — ${sourceName} is unchanged.`
      : `Your edit created ${forkName} — ${sourceName} is unchanged.`,
  );
}
