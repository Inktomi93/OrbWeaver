// @orb/contracts/discovery — the cross-boundary vocabulary of the discovery (library-semantics) domain.
// Kit-only (zod; no domain, no @orb/db, no sibling contracts node).
//
// Today this homes ONE axis: the dedup `relation`. The duplicate-pair rollup (the `find-duplicates`
// workload) labels each near-identical CHAT pair as a genuine accidental look-alike (`duplicate`) vs a
// known fork-lineage family (`forked` — chats sharing a `chats.parentChatId` fork root, D27). Promoted
// here (it was a local tuple in `@orb/db/schema/discovery`) so the `duplicate_chat_pairs.relation` column
// DERIVES it + CHECK-enforces it + a `.int` test-mirror pins the two — the D34 one-home rule, mirroring
// `IMAGE_LENSES` in `@orb/contracts/embeddings`. Characters have NO fork lineage (D28 snapshots), so only
// `duplicate_chat_pairs` carries the column; `duplicate_character_pairs` has none.

import { z } from "zod";

export const RELATIONS = ["duplicate", "forked"] as const;
export type DuplicateRelation = (typeof RELATIONS)[number];
export const duplicateRelationSchema = z.enum(RELATIONS);

// ── The discovery workloads' params + result vocabulary (the workloads junk-drawer exit: a workload's
//    params schema + result shape are authored by the OWNING domain, then correlated to the kind by
//    `@orb/contracts/workloads`). Five kinds ride these: compute-themes, distill-characters,
//    compute-cooccurrence, find-duplicates, csls. ──

/** compute-themes: the k-means theme pass. `k` is an optional per-run cluster count; precedence is
 *  param → `UserSettings.workloads.computeThemesK` → discovery's own floor, resolved in the contribution. */
export const computeThemesWorkloadParams = z.object({ k: z.number().int().positive().optional() });
export type ComputeThemesWorkloadParams = z.infer<typeof computeThemesWorkloadParams>;

/** find-duplicates: the near-dup analytics pass. `threshold` is an optional per-run raw-COSINE floor for
 *  the CHARACTER arm (0..1); precedence is param → `UserSettings.workloads.dupThreshold` → discovery's
 *  floor. The chat arm is Jaccard of segment content-hash sets — an incompatible scale — so it keeps its
 *  own floor internally and this knob never touches it. */
export const findDuplicatesWorkloadParams = z.object({ threshold: z.number().min(0).max(1).optional() });
export type FindDuplicatesWorkloadParams = z.infer<typeof findDuplicatesWorkloadParams>;

/** What every discovery analytics pass reports: rows examined, rows written. */
export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
}

// The PROSE-1 discovery slot table (the three whole side-generation system prompts) — `#prose` imports it
// to compose `PROSE_SLOTS`.
export { DISCOVERY_PROSE_SLOTS } from "./prose";
