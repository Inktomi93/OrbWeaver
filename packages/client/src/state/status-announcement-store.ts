// THE IMPERATIVE LIVE-REGION CHANNEL (D70 client commons) — "say this in the app's `role=status` region,
// now", for a user-initiated MUTATION whose result lands somewhere the user is not looking.
//
// WHY IT EXISTS (#863 P1, side-eye 2026-08-30): the only live region the app had was `app-root`'s ROUTE
// announcer, whose message derives from the section/selection. Turning game mode on or off changes neither,
// so a measured drive found the region still reading the stale "Loaded chat." four seconds after the toggle
// — a screen-reader user was told nothing at all, in either direction. A route-derived string cannot carry
// an event; this store is the event channel, and `app-root` renders BOTH through the ONE `AriaAnnouncer`
// (a second live region is a second thing to keep empty — the drive found one of those too).
//
// TRANSIENT BY CONSTRUCTION: an announcement is a moment, not state. `app-root` announces the ROUTE line
// through this same channel on every navigation, so an event string is replaced by the next navigation
// rather than lingering; nothing here is persisted.

import { createGatedStore } from "./create-gated-store.ts";

interface StatusAnnouncementState {
  /** The pending announcement; `""` = nothing to say (the route announcement shows through). */
  readonly message: string;
}

const useStatusAnnouncementStore = createGatedStore<StatusAnnouncementState>("status-announcement", (): StatusAnnouncementState => ({ message: "" }));

/** Announce `message` in the app's polite status region.
 *
 *  A live region fires on a text CHANGE, so setting the identical string twice in a row announces once —
 *  which is correct here and not worth a nonce: the announcements this channel carries are TRANSITIONS, and
 *  a transition alternates its text by construction (on ⇄ off). */
export function announceStatus(message: string): void {
  useStatusAnnouncementStore.setState({ message }, false, "statusAnnouncement/announce");
}

/** Reactive: the pending announcement (`""` when none). Read ONLY by the app-root announcer. */
export function useStatusAnnouncement(): string {
  return useStatusAnnouncementStore((s) => s.message);
}
