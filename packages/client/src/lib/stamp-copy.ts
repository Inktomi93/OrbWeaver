// How a surface says when an entity was made, edited or computed: ONE time rule for every lead-word stamp and every labeled row.
// A leaf over `@orb/kit/time` only, so a spec's node side reads the leads without loading the component graph. The caller passes the
// display seam (`timeLib`), so the probe-mode freeze of `formatRelative` still applies.
// The rule: under a minute reads "just now" (the bare `now` the Intl form gives reads as broken English after a lead word); past
// that, `formatRelative`, which falls to an absolute date after its week horizon. A schedule keeps absolute `formatDateTime`, and an
// entry row's mono meta column keeps `formatRelativeCompact` with no lead word.

import type { TimeLib } from "@orb/kit/time";
import { MS_PER_MINUTE } from "@orb/kit/time";

/** The lead of an edit stamp, over how long ago the entity was last edited. */
export const EDITED_STAMP_LEAD = "edited";

/** The lead of a creation stamp, over how long ago the entity was made. */
export const CREATED_STAMP_LEAD = "created";

/** The lead of a save stamp, over how long ago the entity was last saved. */
export const SAVED_STAMP_LEAD = "saved";

/** What a stamp reads when its instant is under a minute old, or ahead of the clock. */
export const FRESH_STAMP_WORD = "just now";

type StampClock = Pick<TimeLib, "now" | "formatRelative">;

/** The one time form every stamp shares. */
export function stampWhen(time: StampClock, epochMs: number): string {
  return time.now() - epochMs < MS_PER_MINUTE ? FRESH_STAMP_WORD : time.formatRelative(epochMs);
}

export function editedStamp(time: StampClock, epochMs: number): string {
  return `${EDITED_STAMP_LEAD} ${stampWhen(time, epochMs)}`;
}

export function savedStamp(time: StampClock, epochMs: number): string {
  return `${SAVED_STAMP_LEAD} ${stampWhen(time, epochMs)}`;
}

/** How far past creation an `updatedAt` must be to count as an edit: an import or create writes its row in one batch, so its two stamps differ by less. */
const EDIT_AFTER_CREATE_MS = MS_PER_MINUTE;

/** Whether an entity was edited after it was made, so a surface shows "edited" only when it says something "created" does not. */
export function wasEditedAfterCreate(createdAt: number, updatedAt: number): boolean {
  return updatedAt - createdAt > EDIT_AFTER_CREATE_MS;
}

export function createdStamp(time: StampClock, epochMs: number): string {
  return `${CREATED_STAMP_LEAD} ${stampWhen(time, epochMs)}`;
}
