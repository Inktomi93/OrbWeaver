// The ONE derivation of a preset library row's SUBTITLE (visual-blech audit F5: nine rows all titled
// "Default (edited)" with no subtitle were impossible to tell apart — `PresetSummary` already carries
// `kind` + `updatedAt`). The relative stamp comes from the caller's `formatRelative` (the client's ONE
// time seam, `#lib`'s `timeLib`) so this stays pure + deterministically testable.

/** The kind ALWAYS leads the subtitle, including the ordinary `generation` (crunch-list item 6, 2026-08-02:
 *  the built row printed a bare "edited 2h ago" where the mock reads "generation · edited 3d ago"). It is
 *  the row's CATEGORY, and a category the eye can scan on every row beats one that appears only on the odd
 *  imported `roleplay` — an absent prefix reads as a missing datum, not as "this one is ordinary".
 *  `system` never reaches here: the built-in row prints its own "Built-in default" subtitle instead.
 *
 *  A preset row's subtitle: `<kind> · [forked from <source> ·] edited <relative updatedAt>`.
 *
 *  `forkedFromName` is the RESOLVED source name (`PresetSummary.forkedFrom` looked up in the rows the
 *  caller already has), null when the row is not a fork OR when its source is not among them — a packaged
 *  template never is. Null prints NOTHING: no name-matching heuristic ever invents lineage.
 *
 *  `active` LEADS when set (#99 item 3). The row's active state was carried by a filled dot in the trailing
 *  cluster and by nothing else in words, while the context panel 400px away said it with an "Active" chip —
 *  one fact, two vocabularies, and the row's half was a mute glyph. The word goes in the SUBTITLE, which is
 *  a flexible truncating text column, so the state gains a reading without any element entering or leaving
 *  the row's layout. See `preset-library-row.tsx`'s O-1 header for why it is emphatically NOT a title-line
 *  chip: that exact shape was a measured P0 (a reveal-swapped Badge reflowing the title line under a
 *  stationary pointer, ~85 hover crossings/sec). The dot stays; it is the AFFORDANCE. This is the DATUM. */
export function presetRowSubtitle(
  { kind, updatedAt, forkedFromName, active = false }: { kind: string; updatedAt: number; forkedFromName: string | null; active?: boolean },
  formatRelative: (epochMs: number) => string,
): string {
  const parts = [
    ...(active ? ["Active"] : []),
    kind,
    ...(forkedFromName === null ? [] : [`forked from ${forkedFromName}`]),
    `edited ${formatRelative(updatedAt)}`,
  ];
  return parts.join(" · ");
}
