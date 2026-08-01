// The ONE derivation of a preset library row's SUBTITLE (visual-blech audit F5: nine rows all titled
// "Default (edited)" with no subtitle were impossible to tell apart — `PresetSummary` already carries
// `kind` + `updatedAt`). The relative stamp comes from the caller's `formatRelative` (the client's ONE
// time seam, `#lib`'s `timeLib`) so this stays pure + deterministically testable.

/** Kinds that carry NO scent and are never printed: `generation` is what every client-minted preset gets,
 *  and `system` is the built-in's own label (a copy-on-write fork inherits it). Anything else — an imported
 *  `roleplay`, a packaged `rpg-gm` — is real differentiating information and leads the subtitle. */
const UNPRINTED_KINDS: ReadonlySet<string> = new Set(["generation", "system"]);

/** A preset row's subtitle: `edited <relative updatedAt>`, prefixed with the kind when the kind says
 *  something (see {@link UNPRINTED_KINDS}). The built-in row does not use this — it keeps its own
 *  "Built-in default" marker. */
export function presetRowSubtitle(kind: string, updatedAt: number, formatRelative: (epochMs: number) => string): string {
  const edited = `edited ${formatRelative(updatedAt)}`;
  return UNPRINTED_KINDS.has(kind) ? edited : `${kind} · ${edited}`;
}
