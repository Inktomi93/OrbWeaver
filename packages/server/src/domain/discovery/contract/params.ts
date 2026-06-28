// domain/discovery/contract/params — the dispatch axes + the verb input shapes for the duplicate-character +
// theme/hub slice (the typed surface; §7.4 — every exported param shape homes HERE, not inline in a verb).
//
// §7.5 STRING-UNION DISPATCH: `ThemeLevel` (`scene | arc`) is the ONE importable union for the clustering
// level — derived from the {@link THEME_LEVELS} tuple, never inline re-spelled across `themes` / the
// `theme_clusters.level` column / `digest_theme_assignments`. (The db `theme_clusters.level` column is plain
// TEXT — db may not import this server-tier home — and the domain validates against this tuple, schema/
// discovery.ts header.)

// ── ThemeLevel (the clustering-level dispatch axis) ───────────────────────────
/** `scene` = the tier-0 single-block digests; `arc` = the tier-1+ cross-block syntheses. The ONE home for
 *  the level axis (db column, reads, and compute all derive from this tuple — no inline re-spell). */
export const THEME_LEVELS = ["scene", "arc"] as const;
/** The clustering-level union — derived from {@link THEME_LEVELS} (§7.5 no-inline-union-redecl). */
export type ThemeLevel = (typeof THEME_LEVELS)[number];

// ── compute-pass option bags (workload-driven; all fields optional with built-in defaults) ────────────
/** Options for the `computeDuplicatePairs` recompute. `threshold` is the raw-cosine floor a pair must clear
 *  to be recorded (default {@link DEFAULT_DUP_THRESHOLD}); the recorded `cslsScore` is the hub-adjusted rank
 *  key, but the THRESHOLD gates on raw cosine (a hub-deflated near-dup must still be a near-dup). */
export interface ComputeDuplicatesOptions {
  readonly threshold?: number;
}

/** Options for the `computeThemes` recompute. `k` forces the cluster count (else a √(n/2) heuristic per
 *  (owner, level, space)); `seed` pins the k-means++ seeding PRNG (determinism — no ambient randomness). */
export interface ComputeThemesOptions {
  readonly k?: number;
  readonly seed?: number;
}

/** Options for the `compute*HubScores` passes. `k` overrides the CSLS neighbour count (default `CSLS_K`);
 *  `denseMax` overrides the dense-vs-streaming switch (default `HUBNESS_DENSE_MAX`) — primarily a test seam
 *  to force the streaming branch on a small fixture (the two paths are bit-for-bit identical). */
export interface ComputeHubScoresOptions {
  readonly k?: number;
  readonly denseMax?: number;
}

// ── read option bags ──────────────────────────────────────────────────────────
/** Options for the owner-scoped `duplicateCharacters` read. `limit` caps the returned pairs (CSLS-ranked,
 *  highest first); `minScore` is an optional CSLS-score floor on the returned rows. */
export interface DuplicateCharactersOptions {
  readonly limit?: number;
  readonly minScore?: number;
}
