// Displayed prose groups retain every original source occurrence and its server rank.

import { projectBodyForPreview } from "@orb/kit/content";
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
