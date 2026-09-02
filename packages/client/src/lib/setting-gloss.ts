// The config ROW GLOSS — the first sentence of a leaf's `teach.summary`, and the one derivation of it.
//
// TWO CONSUMERS IN TWO TIERS, so it cannot live with either: the tier-2 `SettingRow` frame publishes it as
// the field's description (`#components/setting-teach-row.tsx`, #932's E5 half) and the config feature's
// teacher prints the same line per roster entry (#926). A second `indexOf(". ")` in the feature would be
// exactly the row/pane drift the leaf-locked `teach` declaration exists to prevent — and a `.tsx` component
// module may not export a non-component (`useComponentExportOnlyModules`), so `#lib` is the floor both
// reach. Pure string in, pure string out; no registry vocabulary crosses.

/** The first sentence of a summary — the row's visible one-line gloss (the teacher carries the rest). A
 *  summary with no sentence break IS its own gloss; the R-TEACH honesty arm already forbids an empty one. */
export function settingGloss(summary: string): string {
  const end = summary.indexOf(". ");
  return end === -1 ? summary : summary.slice(0, end + 1);
}
