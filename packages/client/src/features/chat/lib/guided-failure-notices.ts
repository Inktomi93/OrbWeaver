// The guided-fire FAILURE notices — the two composed toasts `useGuidedActions` raises itself, in one home.
// Both exist because their failure has NO `meta.errorToast` seam of its own: impersonate rides a
// SUBSCRIPTION (not a mutation), and a failed generated opening now rides a SUCCESSFUL `startChat` (the
// failure is DATA, not a rejection — START-1). Without these two, both died silent.
//
// Composed `"<lead> <detail>"` (+ a recovery hint on the opening arm): the LEAD names what failed and, on a
// post-commit path, what SURVIVED — that distinction is the whole point. "Couldn't do X" over a room that
// WAS created reads as "nothing happened", and the user's retry mints a second room (the owner's dead-engine
// incident). The DETAIL is the server's own curated message when the failure carried one; a transport/link
// or provider fault's message is framework text (never user copy, and a credential-echo risk), so it
// degrades to `GENERATION_FAILED_DETAIL`.

import {
  GENERATION_FAILED_DETAIL,
  IMPERSONATE_AFTER_COMMIT_FAILED_LEAD,
  IMPERSONATE_FAILED_LEAD,
  notify,
  OPENING_AFTER_COMMIT_FAILED_HINT,
  OPENING_AFTER_COMMIT_FAILED_LEAD,
} from "#lib";

/** The guided-IMPERSONATE failure toast. Stays SILENT for the ONE case another surface already owns: a DRAFT
 *  whose `startChat` commit itself failed — that is the mutation's own rejection and its `errorToast` already
 *  fired (double-toast). `committedHere` flips the lead once the commit is behind us, so a post-commit failure
 *  says the room survived. */
export function notifyImpersonateFailure(error: unknown, at: { readonly committedHere: boolean; readonly draft: boolean }): void {
  if (at.draft && !at.committedHere) {
    return;
  }
  const lead = at.committedHere ? IMPERSONATE_AFTER_COMMIT_FAILED_LEAD : IMPERSONATE_FAILED_LEAD;
  // `streamImpersonation` only ever rejects with USER copy: the typed terminal frame's curated domain message,
  // or GENERATION_FAILED_DETAIL for a link fault (whose own message is framework text).
  const detail = error instanceof Error && error.message !== "" ? error.message : GENERATION_FAILED_DETAIL;
  notify.error(`${lead} ${detail}`);
}

/** The START-1 honest toast: the room EXISTS and is being opened; only its generated opening died. `reason` is
 *  the server's curated message when the failure carried one (a `DomainError`), else null → the generic copy. */
export function notifyOpeningFailure(reason: string | null): void {
  notify.error(`${OPENING_AFTER_COMMIT_FAILED_LEAD} ${reason ?? GENERATION_FAILED_DETAIL} ${OPENING_AFTER_COMMIT_FAILED_HINT}`);
}
