// The guided-fire FAILURE notice `useGuidedActions` raises itself. It exists because impersonate rides a
// SUBSCRIPTION, not a mutation — there is no `meta.errorToast` seam on it, so without this the failure died
// silent.
//
// Composed `"<lead> <detail>"`: the LEAD names what failed; the DETAIL is the server's own curated message
// when the failure carried one. A transport/link or provider fault's message is framework text (never user
// copy, and a credential-echo risk), so it degrades to `GENERATION_FAILED_DETAIL`.
//
// IT USED TO BE TWO (chat-creation-draft-mode-replacement.md §4.4, R1). `notifyOpeningFailure` was START-1's
// honest degrade: a `generate` opening could fail on a `startChat` that had ALREADY committed the room, so the
// failure arrived as DATA on a successful mutation and the toast had to say the room survived. Creation and
// generation are unfused now — a generated opening is an ordinary turn against a room that already exists —
// so that whole outcome class is unreachable and its copy went with it. The impersonate lead lost its
// post-commit variant for the same reason: there is no commit inside an impersonate any more.

import { GENERATION_FAILED_DETAIL, IMPERSONATE_FAILED_LEAD, notify } from "#lib";

/** The guided-IMPERSONATE failure toast. */
export function notifyImpersonateFailure(error: unknown): void {
  // `streamImpersonation` only ever rejects with USER copy: the typed terminal frame's curated domain message,
  // or GENERATION_FAILED_DETAIL for a link fault (whose own message is framework text).
  const detail = error instanceof Error && error.message !== "" ? error.message : GENERATION_FAILED_DETAIL;
  notify.error(`${IMPERSONATE_FAILED_LEAD} ${detail}`);
}
