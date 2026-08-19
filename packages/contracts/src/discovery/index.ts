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

/** The page CEILING for every discovery top-N read (`similarChats`, `swipeHotspots`, `forgottenGems`,
 *  `topKeywords`, `cooccurringKeywords`, `characterKeywords`, `duplicate*`, `browseCharacters`), enforced at
 *  the transport trust boundary (the `CHARACTER_LIST_MAX_LIMIT` precedent). These are top-N analytics over a
 *  GROWING library (characters/keywords/chats), and the domain verbs page an unbounded SQL `.limit()`, so an
 *  over-bound ask is a BAD_REQUEST rather than the #45-class unbounded fetch. Generous: clients ask ≤ ~40. */
export const DISCOVERY_LIST_MAX_LIMIT = 500;

/** The node CEILING for the `similarityGraph` read (`maxNodes`), enforced at the transport trust boundary.
 *  Unlike the top-N reads above this is an ALL-PAIRS in-RAM projection (O(n²)), so an unbounded `maxNodes`
 *  is a self-DoS: the verb defaults to 120 highest-degree characters; this caps an over-ask rather than
 *  letting a huge library project a quadratic graph. Generous over the 120 default, bounded for the O(n²). */
export const DISCOVERY_GRAPH_MAX_NODES = 500;

/** The `suggestCharacterTags` REFUSAL discriminator — the card carries no content beyond its `Name:` line,
 *  so there is nothing to distill and any facets would be invented from the name alone. Homed here (not in
 *  the domain's `contract/errors.ts`) because BOTH ends key on the literal: the server error class rides it
 *  as its `DomainOperationError.code` → the tRPC formatter's `data.reason`, and the client's tag-suggestion
 *  toast branches on that field — never on message text (the `TURN_ABORTED_OP_CODE` precedent). */
export const CARD_NOT_DISTILLABLE_REASON = "card_not_distillable";

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

/**
 * Why a pass wrote nothing — the honest-accounting discriminator (issue #166).
 *
 * A ZERO IS NOT A SUCCESS SENTENCE. `compute-themes` clusters MEMORY DIGESTS, and a library with none ran to
 * `succeeded` with `{scanned: 0, written: 0}` and a result line reading "0 rows · 0 written" — a pass that
 * could not run at all, reported as one that ran and found nothing. Typed rather than a free-text note so the
 * client's copy is an exhaustive `Record` over this union (§5.5) instead of a server-authored sentence
 * crossing the wire.
 *
 * `no-digests` — the input plane is empty: memory has never been backfilled (or memory is disabled).
 * `no-cards` — the owner's library has nothing to read yet.
 */
export const ANALYTICS_EMPTY_REASONS = ["no-digests", "no-cards"] as const;
export type AnalyticsEmptyReason = (typeof ANALYTICS_EMPTY_REASONS)[number];

/** What every discovery analytics pass reports: rows examined, rows written, and — when it wrote nothing
 *  because its INPUT was empty rather than because there was nothing to change — why. */
export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
  /** Present ONLY on a pass that refused for want of input. Absent on a real zero-change run. */
  readonly emptyReason?: AnalyticsEmptyReason;
}

// The PROSE-1 discovery slot table (the three whole side-generation system prompts) — `#prose` imports it
// to compose `PROSE_SLOTS`.
export { DISCOVERY_PROSE_SLOTS } from "./prose.ts";
