// The corpus omnibox's RESULT TEXT rules — the pure string/collection decisions behind a search row, split
// out of `corpus-search-results.tsx` (the renderer was over the client component-size cap, and these four
// answers are prose logic with no JSX in them). Every one of them exists because the wire hands the reader
// something raw: an id-shaped room, a mid-word markdown slice, a count the list cannot keep, or the same
// evidence twice (side-eye corpus re-pass 2026-08-19 — C1/C2/C3 + U2).

import { projectBodyForPreview } from "@orb/kit/content";
import { deriveChatTitle } from "#lib";

/** The display budget for a verbatim excerpt (a scene snippet, a memory digest). Under the wire's own
 *  280-char slice ON PURPOSE: that slice lands mid-word, and only a cut this side of it can end the line on
 *  a word boundary with an ellipsis (see {@link snippetForDisplay}). */
const SNIPPET_DISPLAY_CHARS = 240;

/** The room's name for a row: the ONE title chain, with the hit's own character as the cast rung. */
export function chatSubtitle(chatTitle: string | null, castName: string | null): string {
  return deriveChatTitle(chatTitle, castName === null ? [] : [castName]);
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

/** Keep the FIRST hit per evidence key (C2 — the server's rank order is descending relevance, so first-wins
 *  keeps the better-scored copy of a duplicated room's byte-identical block). */
export function dedupeByEvidence<T>(hits: readonly T[], evidenceOf: (hit: T) => string): T[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = evidenceOf(hit).trim();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
