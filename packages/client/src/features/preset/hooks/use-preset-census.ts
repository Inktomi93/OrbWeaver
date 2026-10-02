// usePresetCensus — the preset library's ONE census read. Its own module since #1676 because it now has TWO
// readers: the LIST chrome band (`hooks/use-preset-list-header.tsx`) and the phone topbar's screen title
// (`lib/preset-selection-title.ts`), which is where the count lives once the ONE-NAME rule (shell.css) sheds
// the band's title. Both share the `preset.list` cache with the suspending list below, so neither costs a
// request the pane did not already make.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import { usePresetSearchQuery } from "#state";
import { filterPresetsByName, presetSearchNeedle } from "../lib/preset-search.ts";

/**
 * THE CENSUS COUNTS WHAT THE PANE SHOWS (side-eye 2026-08-19 P2). It used to be `presets.length` — the whole
 * library — while the rows below were filtered, so a search with no hits read "PRESETS 6" beside "No matches".
 * The lens lives in `#state` precisely because the readers have no common parent with the rows, and the
 * PREDICATE is the surface's own (`filterPresetsByName`), so they cannot drift into two answers about one list.
 *
 * …AND THE TOTAL SURVIVES THE ZERO (side-eye 2026-08-22 P3-2). That ruling SURVIVES — its input changed.
 * `ListPaneHeader` omits a `0` census on purpose ("a zero census is noise, not information"), which is true of
 * an empty library and false of a FILTERED one: there the band went from `PRESETS 5` to a bare `PRESETS`
 * exactly when the number would have said "your presets are still there, this search just missed them". The
 * readers still print what the pane SHOWS — the leading number — and the string arm carries the total beside
 * it. Every other filter is untouched: `1 of 5` would restate a total the rows already make obvious.
 *
 * `undefined` until the list lands, so an unread library is not reported as an empty one.
 */
export function usePresetCensus(): number | string | undefined {
  const trpc = useTRPC();
  const { data: presets } = useQuery(trpc.preset.list.queryOptions());
  const needle = presetSearchNeedle(usePresetSearchQuery());
  if (presets === undefined) {
    return presets;
  }
  const shown = filterPresetsByName(presets, needle).length;
  return shown === 0 && presets.length > 0 ? `0 of ${String(presets.length)}` : shown;
}
