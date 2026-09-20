// THE ONE spelling of the capability evidence ladder (§6.2). Every synthesis fold reads this order;
// nothing re-spells it. Higher tiers override only the fields they state — except `family-floor`, which
// ORs in (adds, never subtracts).
//
//   declared      — the CONNECTION's own block: the user's box is the truth about the user's box. Wins over
//                   a dated measurement WITH a `declared_overrides_measured` warning naming the field.
//   measured      — a probe receipt: dated, named script.
//   advertised    — a catalog row / daemon row / `/v1/models` window.
//   curated       — the shipped JSON rows, cited.
//   family-floor  — code, OR semantics only (today's `synthesizeToolAxes`: OR's catalog omits
//                   `structured_outputs` for Claude, so a Claude id gets tools/structured OR-ed in).
//   kind-floor    — `KIND_DEFS[kind].floor`.

import { z } from "zod";

export const EVIDENCE_TIERS = ["declared", "measured", "advertised", "curated", "family-floor", "kind-floor"] as const;
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number];
export const evidenceTierSchema = z.enum(EVIDENCE_TIERS);

/** Lower index = higher authority. */
export function evidenceRank(tier: EvidenceTier): number {
  return EVIDENCE_TIERS.indexOf(tier);
}
