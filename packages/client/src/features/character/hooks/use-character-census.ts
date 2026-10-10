// Shared owner-scoped census for the Characters band and phone title; no enriched page read.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { useLibraryScope } from "./use-library-scope.ts";

/** Counts the same archived axis and narrowed lens as the library rows. */
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
  const { data: all } = useQuery(trpc.character.count.queryOptions({ ...archivedAxis }));
  const { data: scoped } = useQuery({
    ...trpc.character.count.queryOptions({ ...scope.args }),
    // An unnarrowed pane asks nothing extra: the scoped query IS the unscoped one, already in cache above.
    enabled: scope.narrowed,
  });

  const total = all;
  if (!scope.narrowed || total === undefined) {
    return total;
  }
  // Still settling: keep printing the honest library total rather than flashing a wrong narrowed number.
  return scoped === undefined ? total : `${String(scoped)} of ${String(total)}`;
}
