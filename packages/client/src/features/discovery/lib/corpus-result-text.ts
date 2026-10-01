// The corpus omnibox's RESULT TEXT rules — the pure string/collection decisions behind a search row, split
// out of `corpus-search-results.tsx` (the renderer was over the client component-size cap, and these four
// answers are prose logic with no JSX in them). Every one of them exists because the wire hands the reader
// something raw: an id-shaped room, a mid-word markdown slice, a count the list cannot keep, or the same
// evidence twice (side-eye corpus re-pass 2026-08-19 — C1/C2/C3 + U2).

import { projectBodyForPreview } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import { deriveChatTitle } from "#lib";

/** The display budget for a verbatim excerpt (a scene snippet, a memory digest). Under the wire's own
 *  280-char slice ON PURPOSE: that slice lands mid-word, and only a cut this side of it can end the line on
 *  a word boundary with an ellipsis (see {@link snippetForDisplay}). */
const SNIPPET_DISPLAY_CHARS = 240;

/** The room's name for a row: the ONE title chain, with the hit's own character as the character rung. */
export function chatSubtitle(chatTitle: string | null, characterName: string | null): string {
  return deriveChatTitle(chatTitle, characterName === null ? [] : [characterName]);
}

/** A verbatim transcript excerpt, made readable (C1). The wire hands back `sourceText.slice(0, 280)`: raw
 *  markdown (`**bold**`, `> ###`, whole code fences) rendered as literal syntax, cut mid-word, and then
 *  closed by the row's own quotation mark — a quote that claims the quotation ended where the truncation
 *  happened. `projectBodyForPreview` is the ONE engine for exactly this (the chats-list scent line's own):
 *  tokenizer-driven, markdown-flattened, whitespace-collapsed, and cut on a WORD boundary with an ellipsis —
 *  so a closing quote now follows an honest "…" instead of half a word. */
export function snippetForDisplay(snippet: string): string {
  return projectBodyForPreview(snippet, SNIPPET_DISPLAY_CHARS);
}

/** What a Scenes row's second line PROMISES vs what it shows (C3). It read "79 matching moments" over three
 *  previewed excerpts in two rooms — a number the surface has no way to reach, presented as if the list
 *  below it were the answer. The count is real and worth keeping (it is how lived-in a character is on this
 *  query), so the line says both: what exists, and what is under it. */
export function evidenceScent(matchCount: number, shown: number, rooms: number): string {
  const moments = `${matchCount} matching moment${matchCount === 1 ? "" : "s"}`;
  const inRooms = `${rooms} room${rooms === 1 ? "" : "s"}`;
  return shown >= matchCount ? `${moments} in ${inRooms}` : `${moments} — showing ${shown} in ${inRooms}`;
}

/** One room a passage was found in — its id (the door) and the name the reader sees. */
export interface EvidenceRoom {
  readonly chatId: ChatId;
  readonly title: string;
}

/** One distinct PASSAGE and every room it turned up in (P1-1). */
export interface EvidencePassage {
  readonly snippet: string;
  readonly rooms: readonly EvidenceRoom[];
}

/** Exactly what this grouping needs off a Scenes segment — the wire type stays in the component. */
interface EvidenceSegment {
  readonly chatId: ChatId;
  readonly chatTitle: string | null;
  readonly snippet: string;
}

/**
 * THE EVIDENCE IS THE UNIT, NOT THE ROOM (side-eye corpus re-pass 2026-08-19, P1-1).
 *
 * The Scenes preview grouped a character's segments BY CHAT: a room header, then its snippets. On a library
 * with a duplicated room — an import run twice, a branched chat — that renders the byte-identical passage
 * once per room, and the audited surface showed three doors each over the same 220-char excerpt. A reader
 * meets that as "the search is broken", because three results that are one result IS a broken search.
 *
 * So the passage is grouped and the ROOMS hang off it: one body, N doors. The projection runs BEFORE the
 * key so two slices that read identically also group identically (the display cut is the honest unit — it
 * is what the reader compares), and order is the server's, first-seen-wins, which is descending relevance.
 * Rooms are de-duplicated within a passage: the same chat quoting the same block twice is one door.
 */
export function groupEvidenceByPassage(segments: readonly EvidenceSegment[], characterName: string): readonly EvidencePassage[] {
  const byPassage = new Map<string, { snippet: string; rooms: EvidenceRoom[] }>();
  for (const segment of segments) {
    const snippet = snippetForDisplay(segment.snippet);
    const group = byPassage.get(snippet.trim()) ?? { snippet, rooms: [] };
    if (!group.rooms.some((room) => room.chatId === segment.chatId)) {
      group.rooms.push({ chatId: segment.chatId, title: chatSubtitle(segment.chatTitle, characterName) });
    }
    byPassage.set(snippet.trim(), group);
  }
  return [...byPassage.values()];
}

/**
 * THE ROOM THAT IS TRUE OF THE WHOLE HIT, SAID ONCE (side-eye corpus re-pass #3, P3-D).
 *
 * The common case on a normal library is the opposite of the duplicated-room case {@link
 * groupEvidenceByPassage} exists for: three passages out of ONE room, which renders the same door three
 * times under one character. The echo is cosmetic, and so is this — the grouping is NOT inverted back (that
 * trade was already measured and lost, see above); the renderer simply lifts the door out when it says the
 * same thing under every passage.
 *
 * Returns that shared room list only when EVERY passage carries the identical set (order-insensitive) and
 * there is more than one passage to share it — otherwise null, and the doors stay with their evidence,
 * because a door that is not true of every passage cannot be hoisted without lying about where a passage
 * came from.
 */
export function sharedRooms(passages: readonly EvidencePassage[]): readonly EvidenceRoom[] | null {
  const first = passages[0];
  if (first === undefined || passages.length < 2) {
    return null;
  }
  const keyOf = (passage: EvidencePassage): string =>
    passage.rooms
      .map((room) => room.chatId)
      .toSorted((a, b) => a.localeCompare(b))
      .join("|");
  const key = keyOf(first);
  return passages.every((passage) => keyOf(passage) === key) ? first.rooms : null;
}

/** The trailing ` (2)` an import writes when two rooms claim one name (`import/substrate/chat-input.ts`'s
 *  `disambiguateChatTitles`) — the only producer of this form besides a person typing it. */
const NUMBERED_ROOM = /\s\(\d+\)$/;

/**
 * What a room door's `(3)` MEANS, for the reader who cannot infer it (P3-6).
 *
 * The number is part of the room's stored TITLE, not a rendering: rooms that arrive sharing a name are
 * numbered at import, and by the time a corpus result draws one the provenance is gone. The hint states the
 * app's rule rather than this room's history — it claims nothing about where this particular title came
 * from, which is the only honest sentence available at this seam. Undefined for an ordinary title, so the
 * tooltip exists exactly where the confusion does.
 */
export function roomNumberingHint(title: string): string | undefined {
  return NUMBERED_ROOM.test(title) ? `${title} — rooms that share a name are numbered.` : undefined;
}

/** Group repeated prose without dropping the identity or rank of any source occurrence. */
export function groupByEvidence<T>(hits: readonly T[], evidenceOf: (hit: T) => string): ReadonlyMap<string, readonly T[]> {
  return Map.groupBy(hits, (hit) => evidenceOf(hit).trim());
}
