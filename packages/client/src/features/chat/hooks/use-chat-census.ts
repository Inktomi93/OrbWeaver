// useChatCensus — the chats roster's ONE census read. Its own module since #1676 because it now has TWO
// readers: the LIST chrome band (`hooks/use-chat-list-header.tsx`) and the phone topbar's screen title
// (`lib/chats-selection-title.ts`), which is where the count lives once the ONE-NAME rule (shell.css) sheds
// the band's title. Both readers share the query cache, so the second one costs no request.
//
// Lifted VERBATIM out of the band it was written in (#490's rules are unchanged, and this file keeps their
// record) — the extraction is the whole edit here, exactly as `use-character-census.ts` did for #1670.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { useChatListCharacterFilter, useChatListMonth, useChatListSearch } from "#state";
import { CHAT_LIST_SEARCH_DEBOUNCE_MS, monthExclusiveUpperBound } from "../lib/chat-list-scope.ts";

/** Its readers want the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;

/**
 * THE COUNT ANSWERS THE LIST IN FRONT OF THE READER (#490).
 *
 * It was the library census and nothing else, so it printed `896` unchanged while the pane below showed
 * twelve `Tamsin` rows — and printed `896` over a "No matches" empty state. A number that ignores the three
 * filters sitting directly beneath it is not a fact about anything visible.
 *
 * Neither reader can see the pane's props (the band feeds a DIFFERENT shell slot; the topbar's screen title
 * is the shell's), which is exactly why all three narrowing axes live in `chat-list-filter-store` — the store
 * minted for this class of cross-region read. When nothing is narrowed this is byte-identical to before: ONE
 * `{limit:1}` census, printed bare. When something is, a second `{limit:1}` census over the SAME scope the
 * pane queries answers "how many of them", and the reader prints `N of TOTAL`. `ListPaneHeader.count` already
 * takes a string for precisely this ("the caller decided the cap, this band just prints what it is handed"),
 * so no shared primitive moves.
 *
 * The search is DAMPED with the pane's own `CHAT_LIST_SEARCH_DEBOUNCE_MS` — one constant, applied by each
 * consumer — so the number and the rows settle on the same keystroke instead of a quarter-second apart.
 */
export function useChatCensus(): number | string | undefined {
  const trpc = useTRPC();
  const characterFilter = useChatListCharacterFilter();
  const rawSearch = useChatListSearch();
  const month = useChatListMonth();
  const search = useDebouncedValue(rawSearch.trim(), CHAT_LIST_SEARCH_DEBOUNCE_MS);
  const beforeRecencyAt = monthExclusiveUpperBound(month);
  const narrowed = characterFilter !== null || search !== "" || beforeRecencyAt !== null;

  const { data: all } = useQuery(trpc.chat.listChats.queryOptions({ limit: COUNT_ONLY_PAGE }));
  const { data: scoped } = useQuery({
    ...trpc.chat.listChats.queryOptions({
      limit: COUNT_ONLY_PAGE,
      ...(characterFilter === null ? {} : { characterId: characterFilter.id }),
      ...(search === "" ? {} : { search }),
      ...(beforeRecencyAt === null ? {} : { beforeRecencyAt }),
    }),
    // An unnarrowed pane asks nothing extra: the scoped query IS the unscoped one, already in cache above.
    enabled: narrowed,
  });

  const total = all?.totalCount;
  if (!narrowed || total === undefined) {
    return total;
  }
  // Still settling: keep printing the honest library total rather than flashing a wrong narrowed number.
  return scoped === undefined ? total : `${scoped.totalCount} of ${total}`;
}
