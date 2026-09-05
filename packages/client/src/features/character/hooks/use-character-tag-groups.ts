// useCharacterTagGroups — the library's GROUP-BY-TAG census (#1696), over the SAME resolved scope the pane's
// rows are paged with.
//
// WHY IT IS A SECOND READ AND NOT A FIELD ON THE PAGE. `character.list` is an INFINITE query: its answer is
// a page, its cache is a list of pages, and a per-page census would either be repeated on every page (a
// number that arrives N times and can disagree with itself mid-flight) or read off page 1 (a number whose
// freshness depends on which page happened to refetch). The band's own `{limit:1}` census is the precedent
// for the same reason, one region over.
//
// IT ASKS ONLY IN THE MODE THAT RENDERS IT. A flat list has no buckets, so `enabled` is the categorized
// view's own flag — switching to Group is what buys the request, and switching back stops paying for it.
// The lens axes are `useLibraryScope`'s ONE resolution (the same object `character.list` is spread with), so
// the census and the rows can never be answers about different scopes — which is the whole failure mode the
// prior arm refused a census over.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { TagGroupCensus } from "../lib/character-list-view.ts";
import { useLibraryScope } from "./use-library-scope.ts";

/** The census, or `null` while the read is in flight / has failed — which the fold renders as "the library's
 *  numbers are not known yet", never as a page-derived count. A failed census is the same statement: the
 *  grouped view stays usable over the loaded rows and simply claims nothing about the library. */
export function useCharacterTagGroups(enabled: boolean): TagGroupCensus | null {
  const trpc = useTRPC();
  const scope = useLibraryScope();
  const { data } = useQuery({ ...trpc.character.listTagGroups.queryOptions(scope.args), enabled });
  return data ?? null;
}
