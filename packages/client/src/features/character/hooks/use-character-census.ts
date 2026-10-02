// useCharacterCensus — the Characters library's ONE census read. Its own module since #1670 because it now
// has TWO readers: the LIST chrome band (`hooks/use-characters-list-header.tsx`) and the phone topbar's
// screen title (`lib/character-selection-title.ts`), which is where the count lives when the ONE-NAME rule
// sheds the band's title. Both readers share the query cache, so the second one costs no request.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { useLibraryScope } from "./use-library-scope.ts";

/** Its readers want the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;

/**
 * THE COUNT IS THE SERVER'S CENSUS (2026-08-13), AND IT ANSWERS THE LIST IN FRONT OF THE READER (#518).
 *
 * It was deleted when the list went keyset-paged because the only number available then was "loaded so
 * far", and a census that silently means something else is worse than none. `character.list` serves a real
 * `COUNT` over the request's scope, so this asks for the cheapest possible page and reads `totalCount`.
 *
 * Neither reader can see the pane's props (the band feeds a DIFFERENT shell slot, and the topbar's screen
 * title is the shell's), which is exactly why every narrowing axis lives in the library store — the search
 * included, since #518. When nothing is narrowed this is byte-identical to what it always was: ONE
 * `{limit:1}` census, printed bare. When something is, a second `{limit:1}` census over the SAME scope the
 * pane queries answers "how many of them", and the reader prints `N of TOTAL`
 * (`ListPaneHeader.count` already takes a string for precisely this). The search is
 * damped with the pane's own `CHARACTER_SEARCH_DEBOUNCE_MS` — one constant, applied by each consumer — so
 * the number and the rows settle on the same keystroke.
 *
 * `archived` is tri-state on the wire exactly as the pane spells it: the toggle's ON state is the WIDER
 * library (archived rows shown beside the rest), so it sends nothing at all — and it is therefore not one
 * of the axes that makes the pane "narrowed" here, for the same reason the rail's `N active` datum does not
 * count it. It IS on BOTH counts, though (#1503): "not narrowed" says nothing is filtering the library, not
 * that hidden rows should be counted — see `archivedAxis` below.
 */
export function useCharacterCensus(): number | string | undefined {
  const trpc = useTRPC();
  // The SAME resolution the pane's rows are fetched with (`use-library-scope.ts`) — not a second spelling
  // of it. A band that re-derived the lens would be free to drift from the list it names, and "the census
  // and the rows disagree" is the defect this whole change exists to close.
  const scope = useLibraryScope();

  // THE BASELINE CARRIES THE ARCHIVED AXIS TOO (#1503). "Not narrowed" is a claim about the FILTER lens —
  // search, favourites, tags — and archived is not one of those: it decides which rows EXIST for this pane
  // at all. Leaving it off the baseline made the bare census count rows the list refuses to show (the
  // default is `archived: false`, so a library with 40 characters and 8 archived printed 40 over 32 rows,
  // with nothing on screen accounting for the eight), and it made the sentence below — "the scoped query IS
  // the unscoped one" — untrue for every unnarrowed pane, because the two queries differed by exactly this
  // key. Lifted off `scope.args` rather than re-read from the store, so there is still ONE spelling of the
  // rule and the baseline cannot drift from the rows.
  const archivedAxis = scope.args.archived === undefined ? {} : { archived: scope.args.archived };
  const { data: all } = useQuery(trpc.character.list.queryOptions({ limit: COUNT_ONLY_PAGE, ...archivedAxis }));
  const { data: scoped } = useQuery({
    ...trpc.character.list.queryOptions({ limit: COUNT_ONLY_PAGE, ...scope.args }),
    // An unnarrowed pane asks nothing extra: the scoped query IS the unscoped one, already in cache above.
    enabled: scope.narrowed,
  });

  const total = all?.totalCount;
  if (!scope.narrowed || total === undefined) {
    return total;
  }
  // Still settling: keep printing the honest library total rather than flashing a wrong narrowed number.
  return scoped === undefined ? total : `${String(scoped.totalCount)} of ${String(total)}`;
}
