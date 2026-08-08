// domain/character/contract/refinery-ops — the TYPES of the two character-owned ops the refinery domain
// consumes (R1 — docs/design/refinery-r0.md §9.3). Cross-feature dependency is never a sideways import
// (AGENTS §2): refinery declares these shapes type-only and the runtime ops are wired at `entry/compose`
// from THIS domain's persistence factories — `characters.*` keeps exactly one writer (F6).

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryAnalyzePayload } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";

/** The context both refinery-op factories close over. */
export interface CharacterRefineryOpsContext {
  readonly db: Db;
}

/** Load one OWNED character's canonical card (the full `cardOf` projection — the one home for the card's
 *  JSON parse seams). `undefined` = absent OR foreign, collapsed — the consumer throws ITS leak-free
 *  not-found (the existence-oracle posture). Refinery snapshots this into `refinery_sessions.original_card`
 *  at session start and re-reads the LIVE card at apply time (the greeting-index assert runs against the
 *  live array, never the snapshot). */
export type LoadOwnedCardOp = (args: { readonly ownerId: UserId; readonly characterId: CharacterId }) => Promise<CharacterCard | undefined>;

/** One half of the derived signals — the two halves have INDEPENDENT producers (a score run stamps
 *  `score`, an analyze run stamps `analysis`; security pass §1 gap 2), so the patch is one arm, never
 *  both, and the stamp merges it over the currently-stored other half. */
export type RefinerySignalsPatch = { readonly score: number } | { readonly analysis: RefineryAnalyzePayload };

/** Merge-stamp `characters.refinery` for one OWNED character. The owner predicate rides IN THE WHERE
 *  (injected-op-caller-gate: an op that dropped its caller would be a cross-tenant write hole) — the
 *  refinery verb's ownership belt runs first, this is defense-in-depth, and a zero-row update is a
 *  silent no-op by design. */
export type StampRefinerySignalsOp = (args: {
  readonly ownerId: UserId;
  readonly characterId: CharacterId;
  readonly patch: RefinerySignalsPatch;
}) => Promise<void>;
