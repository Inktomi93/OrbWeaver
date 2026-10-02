// useCorpusCensus — the corpus catalog's ONE census read. Its own module since #1676 because it now has TWO
// readers: the LIST chrome band (`hooks/use-corpus-list-header.tsx`) and the phone topbar's screen title
// (`lib/corpus-selection-title.ts`), which is where the count lives once the ONE-NAME rule (shell.css) sheds
// the band's title. Both readers share the `discovery.catalog` cache (the browse view below suspends on it
// already), so the second one costs no request.

import { useGatedQuery, useTRPC } from "#data";
import { distilledCensus } from "../lib/corpus-vocabulary.ts";

/**
 * THE COUNT NAMES ITS BASE (#535). The band printed a bare `CORPUS 313` — `totalDistilled`, the size of the
 * DISTILLED catalog the list browses — in the same frame as an overview h1 reading "327 characters": two true
 * numbers of two different things, one of them unlabelled. `distilledCensus` is the ONE home of that
 * `N of TOTAL` phrasing, shared with the CONTEXT band, so the readers cannot drift.
 *
 * `undefined` until the catalog lands — the honest "not read yet", and the same rendered result the band's old
 * `?? 0` produced (`ListPaneHeader` prints nothing at 0), stated as the absence it is. `enabled: false` fetches
 * nothing: the phone-title reader runs while another Corpus mode is active.
 */
export function useCorpusCensus(enabled = true): number | string | undefined {
  const trpc = useTRPC();
  const { data: catalog } = useGatedQuery(enabled ? "catalog" : null, () => trpc.discovery.catalog.queryOptions());
  return catalog === undefined ? undefined : distilledCensus(catalog.totalDistilled, catalog.totalCharacters);
}
