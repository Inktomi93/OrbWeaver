// The OIDC re-auth RESUME SNAPSHOT (owner ruling: redirect
// bounce + resume snapshot, not a `prompt=none` iframe).
//
// Rung 1 for an `oidc` deployment is a full-page navigation to the IdP and back. Authentik holding a live
// upstream session makes that round trip near-silent, but it is still a document teardown: every in-memory
// pointer dies. The only one a user notices is WHICH CHAT WAS OPEN — the active section already survives on
// its own (it is durable-local in `orb:shell`), and server truth re-fetches by construction. So the
// snapshot is exactly one field; recording more would be inventing a second, unversioned restore protocol.
//
// sessionStorage, not localStorage, and that is the whole reason this module exists rather than a store
// door: the snapshot belongs to THIS TAB's redirect round trip. In localStorage a second tab would inherit
// a bounce it never took, and the blob would outlive the trip it was written for. It is also read
// ONE-SHOT (`takeSessionResume` deletes as it reads), so a later reload cannot resurrect a stale target.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** The tab-scoped key the bounce writes under. */
const RESUME_KEY = "orb:session-resume";

/** What survives an OIDC re-auth bounce. One field, deliberately — see the header. */
export interface SessionResumeSnapshot {
  /** The chat that was open when the session died, or null (landing / a draft with no id yet). */
  readonly chatId: ChatId | null;
}

function tabStorage(): Storage | undefined {
  return (globalThis as { sessionStorage?: Storage }).sessionStorage;
}

/** Record where to land after the IdP round trip. A no-op where sessionStorage is unavailable. */
export function writeSessionResume(snapshot: SessionResumeSnapshot): void {
  // @orb-waive caught-failure-ownership(catch): storage refused (private mode / disabled) — the bounce still works, it just lands on the landing view. Ends if the resume target becomes required for the bounce to work.
  try {
    tabStorage()?.setItem(RESUME_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage refused (private mode / disabled): the bounce still works, it just lands on the landing view.
  }
}

/** Read the snapshot and CONSUME it — a resume target is valid for exactly one return trip. */
export function takeSessionResume(): SessionResumeSnapshot | null {
  const storage = tabStorage();
  if (storage === undefined) {
    return null;
  }
  let raw: string | null = null;
  // @orb-waive caught-failure-ownership(catch): storage access refused — the resume target degrades to null (the landing view), same as no snapshot ever written. Ends if the resume target becomes required.
  try {
    raw = storage.getItem(RESUME_KEY);
    storage.removeItem(RESUME_KEY);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): a corrupt blob is discarded, never trusted (#11 autosave doctrine) — degrades to null, same as no snapshot.
  try {
    const parsed = JSON.parse(raw) as { readonly chatId?: unknown };
    return { chatId: typeof parsed.chatId === "string" ? castId<ChatId>(parsed.chatId) : null };
  } catch {
    return null; // a corrupt blob is discarded, never trusted (#11 autosave doctrine)
  }
}
