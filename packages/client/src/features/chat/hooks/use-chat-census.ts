// Shared membership-scoped census for the Chats band and phone title; no roster enrichment.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { useDebouncedValue } from "#lib";
import { useChatListCharacterFilter, useChatListMonth, useChatListSearch } from "#state";
import { CHAT_LIST_SEARCH_DEBOUNCE_MS, monthExclusiveUpperBound } from "../lib/chat-list-scope.ts";

/** Counts the same character, search and month lens as the list. */
export function useChatCensus(): number | string | undefined {
  const trpc = useTRPC();
  const characterFilter = useChatListCharacterFilter();
  const rawSearch = useChatListSearch();
  const month = useChatListMonth();
  const search = useDebouncedValue(rawSearch.trim(), CHAT_LIST_SEARCH_DEBOUNCE_MS);
  const beforeRecencyAt = monthExclusiveUpperBound(month);
  const narrowed = characterFilter !== null || search !== "" || beforeRecencyAt !== null;

  const { data: all } = useQuery(trpc.chat.countChats.queryOptions({}));
  const { data: scoped } = useQuery({
    ...trpc.chat.countChats.queryOptions({
      ...(characterFilter === null ? {} : { characterId: characterFilter.id }),
      ...(search === "" ? {} : { search }),
      ...(beforeRecencyAt === null ? {} : { beforeRecencyAt }),
    }),
    // An unnarrowed pane asks nothing extra: the scoped query IS the unscoped one, already in cache above.
    enabled: narrowed,
  });

  const total = all;
  if (!narrowed || total === undefined) {
    return total;
  }
  // Still settling: keep printing the honest library total rather than flashing a wrong narrowed number.
  return scoped === undefined ? total : `${scoped} of ${total}`;
}
