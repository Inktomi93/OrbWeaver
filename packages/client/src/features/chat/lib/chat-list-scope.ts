// The chats-pane SCOPE math: the native month control's `YYYY-MM` → the exclusive displayed-recency
// ceiling the server takes, its localized label, and the one scope identity the virtual list resets on.
// Pure + structural, so it unit-tests without a data layer (the `recent-faces.ts` precedent).

import type { CharacterId } from "@orb/kit/ids";
import { timeLib } from "#lib";

/** Keystroke→request damper for the server-side search. Long enough that typing a name is one query rather
 *  than eight, short enough that the list answers while the user is still looking at the box. It lives HERE
 *  rather than in the pane because the pane is no longer the only consumer: the chats chrome band derives its
 *  narrowed census from the SAME stored search (#490), and two dampers that could drift would let the band's
 *  number and the pane's rows disagree for a quarter second on every keystroke. */
export const CHAT_LIST_SEARCH_DEBOUNCE_MS = 250;

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

/** The phone Filters row's NEUTRAL name — the house word for a group of narrowing controls, not a new one.
 *  Two landed carriers already spell it exactly this way: the Characters pane's own narrowing group
 *  (`features/character/components/character-filter-chips.tsx` — `role="group" aria-label="Filters"`, the
 *  program #102 variant B naming, and the group #491's law is about) and the plugin browse rail's
 *  disclosure trigger (`features/plugin/components/plugin-browse-nodes.tsx`). Recorded in
 *  `docs/design/vocabulary-map.md`. */
const FILTERS_LABEL = "Filters";

/**
 * ONE TRIGGER, BOTH FACTS (#1718 arm A, owner-ruled) — the accessible name of the phone Filters disclosure.
 *
 * #1350's PRINCIPLE SURVIVES, ITS INPUT CHANGED: "a disclosure whose TRIGGER carries the bound when one is
 * set, so folding never hides state" was written when the month bound had a trigger of its own. It has not,
 * since the two stacked disclosures (the month bound's and the faces strip's) became one row — a
 * `--spacing-control-sm` trigger is 44px at a coarse pointer, so the pane was paying that twice for two
 * facts. What changes is that ONE name now has to carry BOTH, and it still hides neither.
 *
 * THE GRAMMAR IS DERIVED FROM THE TWO TRIGGERS IT REPLACES, not invented. They read
 * `Show chats up to June 2020` and `Filter by character · Aria Nightshade`, and the strip's own per-face
 * verb is `Show chats with <name>`. Both facts are therefore already sentences about *chats*, so the shared
 * noun is hoisted once and each axis contributes its own preposition:
 *
 *   | in force        | the name                                                |
 *   | -               | -                                                       |
 *   | nothing         | `Filters`                                               |
 *   | month only      | `Filters: chats up to June 2020`                        |
 *   | character only  | `Filters: chats with Aria Nightshade`                   |
 *   | both            | `Filters: chats with Aria Nightshade, up to June 2020`  |
 *
 * THE CHARACTER LEADS because the panel behind the trigger puts the faces first (side-eye P2b — "the faces
 * are the shortcut you arrive for"), so the name reads in the order the eye finds the controls.
 *
 * A COLON, NEVER AN EM-DASH: this codebase reads an em-dash in product copy as a copy tell
 * (`character-library-welcome.tsx`'s week line states it), and the middle dot the faces trigger used is a
 * SEPARATOR between two peers — wrong here, where the head names the group and the tail says what it is
 * doing.
 *
 * Visible text AND accessible name, because the trigger renders exactly this string (its chevron is
 * decorative) — WCAG 2.5.3: a voice-control user says what is written.
 */
export function phoneFiltersLabel(characterName: string | null, monthLabel: string | null): string {
  const clauses = [...(characterName === null ? [] : [`with ${characterName}`]), ...(monthLabel === null ? [] : [`up to ${monthLabel}`])];
  return clauses.length === 0 ? FILTERS_LABEL : `${FILTERS_LABEL}: chats ${clauses.join(", ")}`;
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

// ── THE ZERO-RESULT VOCABULARY: every ACTIVE axis owes a sentence AND a way out (#541) ────────────────────
// The pane's two zero-result empty states each offered exactly ONE exit, named after whichever axis the arm
// happened to be called after: the search-empty arm said "Clear search" while a month bound was also in
// force — clearing it left the reader in a still-empty list, one narrowing they were never told about still
// on, and the arm had already spent its single action — and the month-empty arm said "Clear month" while a
// character filter was also in force. The COPY already knew ("No chat by June 2020 matches …"), so the
// actions were behind their own sentence. An empty state whose action does not restore results is a dead end
// wearing an exit sign.
//
// The PRIMARY doors are elsewhere and stay there: each field's inset ✕ glyph and the "Filtered: X ✕" chip
// live above the body and survive every body state. The empty state repeating them is the recorded #490
// posture (empty states are load-bearing) — applied here to every axis instead of one.
//
// It lives in this lib and not in the surface because it is the same thing this file already owns: the
// pane's narrowing axes, spelled once (`chatListScopeKey` above is the identity of the same three).

/** One ACTIVE narrowing axis's way out, as an empty state renders it (`components/chat-list-filter-exits`). */
export interface FilterExit {
  readonly key: string;
  readonly label: string;
  readonly onClear: () => void;
}

/** Which axes are narrowing right now, in the order the pane's own chrome presents them. ONE derivation,
 *  shared by both zero-result arms — a per-arm list is how the search arm came to know about the month in its
 *  copy and not in its actions. `onClearCharacter` is injected rather than reaching for the store here so
 *  this stays a pure function of its arguments, like everything else in this file. */
export function activeFilterExits(args: {
  readonly beforeRecencyAt: number | null;
  readonly characterName: string | null;
  readonly onClearCharacter: () => void;
  readonly onClearMonth: () => void;
  readonly onClearSearch: () => void;
  readonly query: string;
}): readonly FilterExit[] {
  // The labels are DELIBERATELY not the inset glyphs' ("Clear the search" / "Clear the month") or the chip's
  // ("Clear the {name} filter"): those controls stay on screen behind this empty state, and two buttons
  // carrying one accessible name is an ambiguity for a voice-control user and for every by-name locator. The
  // spelling here is the app-wide empty-state literal ("Clear search" on characters, presets, databank, …).
  const exits: FilterExit[] = [];
  if (args.query !== "") {
    exits.push({ key: "search", label: "Clear search", onClear: args.onClearSearch });
  }
  if (args.beforeRecencyAt !== null) {
    exits.push({ key: "month", label: "Clear month", onClear: args.onClearMonth });
  }
  if (args.characterName !== null) {
    exits.push({ key: "character", label: "Clear character filter", onClear: args.onClearCharacter });
  }
  return exits;
}

/** The search-empty sentence, over EVERY axis in force — `No chat with Aria by June 2020 matches "cats".` */
export function searchEmptyDescription(characterName: string | null, monthLabel: string | null, query: string): string {
  const withCharacter = characterName === null ? "" : ` with ${characterName}`;
  const byMonth = monthLabel === null ? "" : ` by ${monthLabel}`;
  return `No chat${withCharacter}${byMonth} matches "${query}".`;
}

/** The month-empty sentence, over every axis in force (the search axis is empty on this arm by construction). */
export function monthEmptyDescription(characterName: string | null, monthLabel: string | null): string {
  const withCharacter = characterName === null ? "" : ` with ${characterName}`;
  return `No chats${withCharacter} found by ${monthLabel ?? "the selected month"}.`;
}
