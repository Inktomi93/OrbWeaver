// The Settings search's LIVE state (#866 S2): the query the input holds
// and the LAST SELECTED match. Its own store (not the nav store) because the two facts have different
// lifetimes: navigation survives a cleared search, and a query survives a navigation the reader made by
// clicking a LIST row instead of a hit. Not persisted — a search is a moment, not a preference.
//
// `configSearchMatch` is the ONE seam the marked-row rendering reads (§3.4): the S3 `SettingRowFrame` marks
// the matched row's label with the query's `HighlightedText` ranges for the life of the query; S2's own
// consumers are the results list (which marks its rows off the query directly) and the CONTENT flash.
// Clearing the query clears the match with it — a mark whose query is gone would be unexplainable.

import type { ConfigGroupId } from "./config-group-ids.ts";
import { createGatedStore } from "./create-gated-store.ts";

/** The `@modified` verdict map: per group, the sub ids whose OWNED keys differ from their defaults. Homed
 *  here (the search seam's `#state` file — §7.4's type-home rule) beside the match it filters toward; the
 *  feature's `use-modified-sections.ts` derives it and `lib/config-search.ts` consumes it. */
export type ModifiedSubIds = ReadonlyMap<ConfigGroupId, ReadonlySet<string>>;

/** The LEAF half of the same verdict, as the search entry's own `group::sub::setting` id — a flat set
 *  because that id is already the address (#1099 F16: the section-grain map alone made `@modified` answer
 *  for every leaf of a modified section, so one changed setting returned five rows of which three were
 *  unmodified). A leaf that declares no `key` is never in this set: it has no value of its own to differ. */
export type ModifiedSettingIds = ReadonlySet<string>;

/** Both grains of "modified", derived together so a section's badge and a leaf's mark cannot disagree. */
export interface ConfigModifiedMap {
  readonly subs: ModifiedSubIds;
  readonly settings: ModifiedSettingIds;
}

/** The identity of a selected search hit — enough for a row frame to ask "is this me?". */
export interface ConfigSearchMatch {
  readonly group: ConfigGroupId;
  readonly sub: string | null;
  readonly setting: string | null;
  readonly memberId: string | null;
}

interface ConfigSearchState {
  readonly query: string;
  readonly match: ConfigSearchMatch | null;
}

const EMPTY: ConfigSearchState = { query: "", match: null };

const useConfigSearchStore = createGatedStore<ConfigSearchState>("config-search", (): ConfigSearchState => EMPTY);

/** The input's write. An empty query clears the match too (no mark without its query). */
export function setConfigSearchQuery(query: string): void {
  useConfigSearchStore.setState(query.length === 0 ? EMPTY : { query }, false, "configSearch/setQuery");
}

/** A hit was selected — remember which, so the marked row can identify itself (§3.4's seam). */
export function setConfigSearchMatch(match: ConfigSearchMatch): void {
  useConfigSearchStore.setState({ match }, false, "configSearch/setMatch");
}

/** Test seam: a CT must not inherit another test's query. */
export function __resetConfigSearch(): void {
  useConfigSearchStore.setState(EMPTY, false, "configSearch/__reset");
}

export function useConfigSearchQuery(): string {
  return useConfigSearchStore((s) => s.query);
}

export function useConfigSearchMatch(): ConfigSearchMatch | null {
  return useConfigSearchStore((s) => s.match);
}
