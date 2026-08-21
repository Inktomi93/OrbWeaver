// The chats-pane SCOPE math: the native month control's `YYYY-MM` → the exclusive displayed-recency
// ceiling the server takes, its localized label, and the one scope identity the virtual list resets on.
// Pure + structural, so it unit-tests without a data layer (the `recent-faces.ts` precedent).

import type { CharacterId } from "@orb/kit/ids";
import { timeLib } from "#lib";

const MONTH_VALUE_RE = /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])$/u;
const MID_MONTH_DAY = 15;
const MIDDAY_UTC_HOUR = 12;

/** The first UTC instant of the month AFTER `value` — an EXCLUSIVE ceiling, so the whole selected month
 *  is included without a locale-dependent local-midnight edge. `null` for anything not `YYYY-MM`.
 *  December is the one selection that crosses a year: `Date` normalizes month index 12 into January. */
export function monthExclusiveUpperBound(value: string): number | null {
  const match = MONTH_VALUE_RE.exec(value);
  if (match?.groups === undefined) {
    return null;
  }
  const boundary = new Date(0);
  boundary.setUTCFullYear(Number(match.groups["year"]), Number(match.groups["month"]), 1);
  return boundary.getTime();
}

/** The selected month as the reader's own localized "June 2020" — never the raw `YYYY-MM`. */
export function formatMonthLabel(value: string): string | null {
  const match = MONTH_VALUE_RE.exec(value);
  if (match?.groups === undefined) {
    return null;
  }
  // Mid-month noon stays in the selected calendar month in every IANA zone while the display seam localizes it.
  return timeLib.formatMonthYear(Date.UTC(Number(match.groups["year"]), Number(match.groups["month"]) - 1, MID_MONTH_DAY, MIDDAY_UTC_HOUR));
}

/**
 * The settled identity of EVERY narrowing axis — what `<VirtualList resetScrollKey>` lands index zero on.
 *
 * All three axes ride ONE `keepPreviousData` collection and one never-remounted list, so an axis missing
 * here leaves a deep-scrolled reader at the old offset, clamped into the middle of the newly scoped set.
 * JSON-encoded rather than joined on a separator: a search string may contain any delimiter, and the
 * unsearched `""` must never alias the unscoped `null`.
 */
export function chatListScopeKey(scope: {
  readonly characterId: CharacterId | null;
  readonly search: string;
  readonly beforeRecencyAt: number | null;
}): string {
  return JSON.stringify([scope.characterId, scope.search, scope.beforeRecencyAt]);
}
