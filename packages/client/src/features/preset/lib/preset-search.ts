// The ONE derivation of "which presets does the library's search show" (side-eye 2026-08-19 P2).
//
// It exists because the lens has TWO readers that render in different parts of the shell: the chrome band's
// census (`preset-list-header.tsx`, in `.shell-panel-header`) and the rows themselves
// (`preset-library-surface.tsx`). Both must answer off the SAME predicate or the band reports a library the
// pane is not showing — which is exactly what it did ("PRESETS 6" beside "No matches"). The state is shared
// through `#state`'s `preset-search-store`; the PREDICATE is shared here.
//
// Pure + list-shaped, so it is a plain unit test rather than a rendered one.

/** The minimal row shape the search reads — anything with a name (both readers pass `PresetSummary`s). */
interface NamedRow {
  readonly name: string;
}

/** The comparable form of the search box's raw text. `""` = the rest state (no filtering at all). */
export function presetSearchNeedle(query: string): string {
  return query.trim().toLowerCase();
}

/** The rows a needle shows — every row when the needle is the rest state, a case-insensitive name
 *  substring match otherwise. */
export function filterPresetsByName<Row extends NamedRow>(rows: readonly Row[], needle: string): readonly Row[] {
  return needle === "" ? rows : rows.filter((row) => row.name.toLowerCase().includes(needle));
}
