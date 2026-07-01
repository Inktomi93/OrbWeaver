// AI-native seam reservations — the v2 "synthesize, don't just retrieve" apex (domains/memory.md §9,
// core/Planning-and-Checklists.md, DECISIONS-LEDGER §5). Typed NOW with ZERO behavior so trackers / clips /
// world-state stay ADDITIVE when built (v2) — never a schema fight. The full Clip shape + persistence
// land with the feature; these are the union axes that must exist up front. Self-registering `as const`
// tuples = the canonical home for each axis (no-inline-union-redecl); the type AND the Zod schema both
// DERIVE the tuple (one home — no re-spelled union, no re-spelled `z.enum` member list).

import { z } from "zod";

/** What a clip captures. `'world-state'` pairs with the reserved `{{world_state}}` macro slot (same
 *  dynamic/cache-safe half as `{{memory}}`) + the Phase-2/4 `reconcile-world-state` WorkloadKind
 *  (reserved in domains/workloads.md when the WorkloadKind union + RUNNERS map are built). */
export const CLIP_KINDS = ["fact", "trait", "relationship", "world-state", "plot-thread"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];
/** Wire schema for {@link ClipKind} — `z.enum` over the canonical tuple (derive, don't re-spell). */
export const clipKindSchema = z.enum(CLIP_KINDS);

/** Provenance of a clip. A `'user'` clip is NEVER auto-deleted (knowledge-cluster §9). */
export const CLIP_SOURCE_KINDS = ["user", "synthesized", "promoted"] as const;
export type ClipSourceKind = (typeof CLIP_SOURCE_KINDS)[number];
/** Wire schema for {@link ClipSourceKind} — `z.enum` over the canonical tuple. */
export const clipSourceKindSchema = z.enum(CLIP_SOURCE_KINDS);

/** Reach of a clip. */
export const CLIP_SCOPES = ["character", "chat", "global"] as const;
export type ClipScope = (typeof CLIP_SCOPES)[number];
/** Wire schema for {@link ClipScope} — `z.enum` over the canonical tuple. */
export const clipScopeSchema = z.enum(CLIP_SCOPES);
