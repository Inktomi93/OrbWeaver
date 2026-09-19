// AI-native seam reservations — the v2 "synthesize, don't just retrieve" apex (core/Knowledge-Cluster.md §9,
// core/Core-Planning-and-Checklists.md, DECISIONS-LEDGER §5). Typed NOW with ZERO behavior so trackers / clips /
// world-state stay ADDITIVE when built (v2) — never a schema fight. The full Clip shape + persistence
// land with the feature; these are the union axes that must exist up front. Self-registering `as const`
// tuples = the canonical home for each axis (no-inline-union-redecl); the type AND the Zod schema both
// DERIVE the tuple (one home — no re-spelled union, no re-spelled `z.enum` member list).

import { z } from "zod";

/** What a clip captures. `'world-state'` pairs with the reserved `{{world_state}}` macro slot (same
 *  dynamic/cache-safe half as `{{memory}}`) + the Phase-2/4 `reconcile-world-state` WorkloadKind
 *  (a reserved member of `@orb/contracts/workloads` WORKLOAD_KINDS with a no-op stub runner). */
export const CLIP_KINDS = ["fact", "trait", "relationship", "world-state", "plot-thread"] as const;
/** @public pre-built memory surface — the clip vocabulary lands with the memory domain. */
export type ClipKind = (typeof CLIP_KINDS)[number];
/** @public pre-built memory surface — schema twin of `CLIP_KINDS`. */
export const clipKindSchema = z.enum(CLIP_KINDS);

/** Provenance of a clip. A `'user'` clip is NEVER auto-deleted (core/Knowledge-Cluster.md §9). */
export const CLIP_SOURCE_KINDS = ["user", "synthesized", "promoted"] as const;
/** @public pre-built memory surface — provenance vocabulary (Knowledge-Cluster.md S9). */
export type ClipSourceKind = (typeof CLIP_SOURCE_KINDS)[number];
/** @public pre-built memory surface — schema twin of `CLIP_SOURCE_KINDS`. */
export const clipSourceKindSchema = z.enum(CLIP_SOURCE_KINDS);

export const CLIP_SCOPES = ["character", "chat", "global"] as const;
/** @public pre-built memory surface — clip scope vocabulary. */
export type ClipScope = (typeof CLIP_SCOPES)[number];
/** @public pre-built memory surface — schema twin of `CLIP_SCOPES`. */
export const clipScopeSchema = z.enum(CLIP_SCOPES);
