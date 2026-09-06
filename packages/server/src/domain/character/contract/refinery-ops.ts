// domain/character/contract/refinery-ops — the TYPES of the two character-owned ops the refinery domain
// consumes (R1 — docs/history/design/refinery-r0.md §9.3). Cross-feature dependency is never a sideways import
// (AGENTS §2): refinery declares these shapes type-only and the runtime ops are wired at `entry/compose`
// from THIS domain's persistence factories — `characters.*` keeps exactly one writer (F6).

import type { CharacterCard } from "@orb/contracts/character";
import type { RefineryAnalyzePayload } from "@orb/contracts/refinery";
import type { Db } from "@orb/db";
import type { CharacterId, CharacterSnapshotId, UserId } from "@orb/kit/ids";

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

/** ONE card the score sweep may work on — the card itself plus the owner the stamp must be scoped to (a
 *  bulk sweep spans owners, so the row's own owner rides with it; the stamp op re-asserts it in the WHERE). */
export interface RefineryScoreTarget {
  readonly characterId: CharacterId;
  readonly ownerId: UserId;
  readonly card: CharacterCard;
}

/** What the sweep's enumeration returns. TWO numbers, because the FILL arm's whole point is that `targets`
 *  is SMALLER than the library: reporting only the targets would make a fill run over a fully-scored library
 *  say "scanned 0 cards", which reads as "your library is empty" instead of "everything already has a
 *  score". `inScope` is the whole candidate set (a COUNT, not a fetch — the cards themselves stay unread). */
interface RefineryScoreTargets {
  readonly targets: readonly RefineryScoreTarget[];
  readonly inScope: number;
}

/** Enumerate the cards a `refine-score-sweep` run should consider (R4 / port study I3). `ownerId: null` is
 *  the box-wide bulk pass (every owner's library); a `UserId` narrows to that one owner — the SAME
 *  enumeration-scope contract the workload engine's `WorkloadRunContext.ownerId` carries. `unscoredOnly`
 *  pushes the sweep's FILL arm into SQL rather than reading the whole library to discard most of it.
 *
 *  Synthetic (`__group__`) characters are excluded: they are chat plumbing, never authored cards, so a
 *  quality score about one is meaningless — the same fence `list` applies to the library. */
export type ListRefineryScoreTargetsOp = (args: { readonly ownerId: UserId | null; readonly unscoredOnly: boolean }) => Promise<RefineryScoreTargets>;

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

/** Delete ONE `character_snapshots` row by id, scoped to the OWNER + the owning character (#1551, tightened
 *  #1571/train-78: `injected-op-caller-param` — a retraction is owner-scoped work like the stamp op above,
 *  and the owner predicate rides IN THE WHERE for the same defense-in-depth reason). The apply path's
 *  "auto: before refinery apply" belt-13 snapshot is the apply's WITNESS, not its prelude (the
 *  `restoreCardInPlace` precedent's own words) — it must be taken BEFORE the conditional write to capture
 *  the pre-image at all, so a `CHARACTER_STALE_BASIS` refusal from that write leaves a snapshot with
 *  nothing to witness. This op is how `applyFields` retracts it: never a bulk/owner-wide delete, always the
 *  exact id the failed apply's own `snapshotCharacter` call just minted. A zero-row delete is a silent
 *  no-op (nothing to retract is not an error — a foreign owner's retraction deletes nothing). */
export type DeleteSnapshotOp = (args: {
  readonly ownerId: UserId;
  readonly snapshotId: CharacterSnapshotId;
  readonly characterId: CharacterId;
}) => Promise<void>;
