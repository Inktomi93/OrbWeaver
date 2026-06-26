// AI-native seam reservations — the v2 "synthesize, don't just retrieve" apex (knowledge-cluster.md §9,
// reports/COUNCIL-REVIEW.md, DECISIONS-LEDGER §5). Typed NOW with ZERO behavior so trackers / clips /
// world-state stay ADDITIVE when built (v2) — never a schema fight. The full Clip shape + persistence
// land with the feature; these are the union axes that must exist up front. Self-registering `as const`
// tuples = the canonical home for each axis (no-inline-union-redecl).

/** What a clip captures. `'world-state'` pairs with the reserved `{{world_state}}` macro slot (same
 *  dynamic/cache-safe half as `{{memory}}`) + the Phase-2/4 `reconcile-world-state` WorkloadKind
 *  (reserved in domains/workloads.md when the WorkloadKind union + RUNNERS map are built). */
export const CLIP_KINDS = ["fact", "trait", "relationship", "world-state", "plot-thread"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];

/** Provenance of a clip. A `'user'` clip is NEVER auto-deleted (knowledge-cluster §9). */
export const CLIP_SOURCE_KINDS = ["user", "synthesized", "promoted"] as const;
export type ClipSourceKind = (typeof CLIP_SOURCE_KINDS)[number];

/** Reach of a clip. */
export const CLIP_SCOPES = ["character", "chat", "global"] as const;
export type ClipScope = (typeof CLIP_SCOPES)[number];
