// The ONE derivation of a preset library row's SUBTITLE (visual-blech audit F5: nine rows all titled
// "Default (edited)" with no subtitle were impossible to tell apart — `PresetSummary` already carries
// `kind` + `updatedAt`). The relative stamp comes from the caller's `formatRelative` (the client's ONE
// time seam, `#lib`'s `timeLib`) so this stays pure + deterministically testable.

/** Kinds that carry NO scent and are never printed: `generation` is what every client-minted preset gets,
 *  and `system` is the built-in's own label (a copy-on-write fork inherits it). Anything else — an imported
 *  `roleplay`, a packaged `rpg-gm` — is real differentiating information and leads the subtitle. */
const UNPRINTED_KINDS: ReadonlySet<string> = new Set(["generation", "system"]);

/** A preset row's subtitle: `edited <relative updatedAt>`, prefixed with the kind when the kind says
 *  something (see {@link UNPRINTED_KINDS}) and with the fork LINEAGE when the row has one. The built-in row
 *  does not use this — it keeps its own "Built-in default" marker.
 *
 *  `forkedFromName` is the RESOLVED source name (`PresetSummary.forkedFrom` looked up in the rows the
 *  caller already has), null when the row is not a fork OR when its source is not among them — a packaged
 *  template never is. Null prints NOTHING: no name-matching heuristic ever invents lineage. */
export function presetRowSubtitle(kind: string, updatedAt: number, formatRelative: (epochMs: number) => string, forkedFromName: string | null): string {
  const parts = [
    ...(UNPRINTED_KINDS.has(kind) ? [] : [kind]),
    ...(forkedFromName === null ? [] : [`forked from ${forkedFromName}`]),
    `edited ${formatRelative(updatedAt)}`,
  ];
  return parts.join(" · ");
}
