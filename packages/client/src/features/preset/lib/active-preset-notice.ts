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
