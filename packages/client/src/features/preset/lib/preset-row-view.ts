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
 *  THE SUBTITLE CARRIES NO ACTIVE MARKER (side-eye 2026-08-22 P3-5, issue #481). It briefly did: #99 item 3
 *  put a leading "Active · " here on the grounds that the state was otherwise a mute glyph, and that the
 *  subtitle is "a flexible truncating text column, so the state gains a reading without any element entering
 *  or leaving the row's layout". THE RULING SURVIVES; ITS INPUT CHANGED — the column is not flexible at the
 *  width the pane actually gives it. Measured at the docked list: a 155px subtitle cell, where the active
 *  row rendered `Active · roleplay · edite…` while every INACTIVE row showed `roleplay · edited 43m` whole.
 *  The prefix spent its width on the one row whose metadata the reader most wants, so the marker cost the
 *  datum. #99's real mechanism is preserved intact: the state is still NOT a title-line chip (that exact
 *  shape was a measured P0 — a reveal-swapped Badge reflowing the title line under a stationary pointer,
 *  ~85 hover crossings/sec, `preset-library-row.tsx`'s O-1 header), and nothing enters or leaves the row's
 *  layout. The state's readout is the filled dot plus its `role="radio"`/`aria-checked` pair, which is a
 *  reading AT gets in words; and activation now ANNOUNCES itself (`active-preset-notice.ts`), which is where
 *  the words the eye needs went. */
export function presetRowSubtitle(
  { kind, updatedAt, forkedFromName }: { kind: string; updatedAt: number; forkedFromName: string | null },
  formatRelative: (epochMs: number) => string,
): string {
  const parts = [kind, ...(forkedFromName === null ? [] : [`forked from ${forkedFromName}`]), `edited ${formatRelative(updatedAt)}`];
  return parts.join(" · ");
}
