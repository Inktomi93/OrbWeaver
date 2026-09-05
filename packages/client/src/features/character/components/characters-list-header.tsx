// The Characters LIST chrome-band header — `CHARACTERS` + the count + the ONE primary (New, with Import
// beside it as the band ghost). It closed the A1/N2 gap: characters passed no `listHeader` at all, so its
// title + create lived in the in-surface toolbar while every other section had migrated to the band.
//
// ONE MODE (#501, owner ruling 2026-08-22). The band used to SWAP with the pane (D9): a back chevron +
// `CHATS · <name>` + New chat whenever a character was open, because the pane below it had become her chats.
// The pane is the library now whatever is selected, so a swapping band would mislabel it — the band names
// what the pane IS, and the pane is always the library. Her chats moved to the CONTEXT Chats tab, and the
// two affordances the projection band carried went with them: BACK is not needed (nothing was replaced), and
// New chat is the editor hero's primary (CONTENT tier, where she is open) plus the chats pane's own empty
// state.
//
// IT IS ALSO THE ONE VISIBLE HOME OF THE CENSUS (#518, side-eye se-verify-1). `CHARACTERS 327` and the
// filter rail's `327 characters` printed the same number ~130px apart in a 290px column; the band survives
// by the chats precedent (`chat-list-header.tsx` — a list band prints its list's count), and the pane's line
// stays as a spoken live region only. That single-homing is what makes the lens-aware count below
// mandatory rather than a nicety: one visible census that ignored the filters beside it would be the exact
// #490 defect this section inherited from the other.

import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ListPaneHeader } from "#components";
import { useTRPC } from "#data";
import { useLibraryScope } from "../hooks/use-library-scope.ts";
import { CharacterCreateActions } from "./character-create-actions.tsx";

/** The band wants the CENSUS, not the rows — the smallest page the server will serve still carries it. */
const COUNT_ONLY_PAGE = 1;

/**
 * THE COUNT IS THE SERVER'S CENSUS (2026-08-13), AND IT ANSWERS THE LIST IN FRONT OF THE READER (#518).
 *
 * It was deleted when the list went keyset-paged because the only number available then was "loaded so
 * far", and a census that silently means something else is worse than none. `character.list` serves a real
 * `COUNT` over the request's scope, so this asks for the cheapest possible page and reads `totalCount`.
 *
 * The band cannot see the pane's props (it feeds a DIFFERENT shell slot), which is exactly why every
 * narrowing axis lives in the library store — the search included, since #518. When nothing is narrowed
 * this is byte-identical to what it always was: ONE `{limit:1}` census, printed bare. When something is, a
 * second `{limit:1}` census over the SAME scope the pane queries answers "how many of them", and the band
 * prints `N of TOTAL` (`ListPaneHeader.count` already takes a string for precisely this). The search is
 * damped with the pane's own `CHARACTER_SEARCH_DEBOUNCE_MS` — one constant, applied by each consumer — so
 * the number and the rows settle on the same keystroke.
 *
 * `archived` is tri-state on the wire exactly as the pane spells it: the toggle's ON state is the WIDER
 * library (archived rows shown beside the rest), so it sends nothing at all — and it is therefore not one
 * of the axes that makes the pane "narrowed" here, for the same reason the rail's `N active` datum does not
 * count it. It IS on BOTH counts, though (#1503): "not narrowed" says nothing is filtering the library, not
 * that hidden rows should be counted — see `archivedAxis` below.
 */
function useCharacterCensus(): number | string | undefined {
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

export function CharactersListHeader(): ReactElement {
  const count = useCharacterCensus();
  return <ListPaneHeader action={<CharacterCreateActions />} count={count ?? 0} title="Characters" />;
}
