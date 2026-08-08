// domain/refinery/contract/results — every verb's result/view shapes. The RUN and SUMMARY wire views are
// `@orb/contracts/refinery`'s (one home); the FULL session view lives HERE because it carries
// `originalCard: CharacterCard` — the refinery CONTRACTS namespace may not import `#character` (its
// import-direction law), while this domain-tier contract may (type-only, downward). The tRPC client types
// flow from the router either way.

import type { CharacterCard } from "@orb/contracts/character";
import type { RefinableField, RefineryRun, RefinerySelection, RefinerySessionStatus, RefineryStageConfig } from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import type { CharacterDetail } from "#domain/character";

/** The full session (the CONTENT surface's state) — summary fields + the anti-drift anchor + config. */
export interface RefinerySessionView {
  readonly id: RefinerySessionId;
  readonly characterId: CharacterId;
  readonly name: string | null;
  readonly status: RefinerySessionStatus;
  /** The session-start card snapshot — the anchor every analyze compares against (never edited). */
  readonly originalCard: CharacterCard;
  readonly selection: RefinerySelection;
  readonly stageConfig: RefineryStageConfig;
  readonly guidance: string | null;
  readonly iterationCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Why one accepted entry was DROPPED instead of applied — the per-entry salvage itemization (never a
 *  whole-payload refusal; security pass §1 gap 3). A closed axis so the client renders typed copy. The
 *  tuple stays UNEXPORTED until a runtime consumer exists (R3's reason-copy map re-exports it then);
 *  the derived union below is the wire surface. */
const APPLY_DROP_REASONS = [
  /** The accept names a field the latest rewrite run did not produce. */
  "not_in_rewrite",
  /** The accept names a field outside the SESSION's selection — the model (or the caller) does not get to
   *  widen its own apply scope (belt 9: the systemPrompt-injection stopper). */
  "not_selected",
  /** `field === "greetings"` but the entry carries no `greetingIndex`. */
  "greeting_index_missing",
  /** The `greetingIndex` names a slot past the LIVE card's greetings — a greeting deleted since session
   *  start is dropped, never re-created by index. */
  "greeting_index_invalid",
  /** `greetingIndex` present on a non-greetings field. */
  "greeting_index_forbidden",
  /** The LIVE card no longer carries the structure this entry needs (a depth-prompt rewrite with the
   *  note since deleted — the rewrite cannot invent the `{depth, role}` directive, which is authored). */
  "not_applicable",
] as const;
export type ApplyDropReason = (typeof APPLY_DROP_REASONS)[number];

export interface AppliedFieldRef {
  readonly field: RefinableField;
  readonly greetingIndex?: number | undefined;
}

export interface DroppedField {
  readonly field: RefinableField;
  readonly greetingIndex?: number | undefined;
  readonly reason: ApplyDropReason;
}

export interface ApplyFieldsResult {
  readonly applied: readonly AppliedFieldRef[];
  readonly dropped: readonly DroppedField[];
  /** The updated character detail (the injected `character.update`'s own return) — the client's refresh. */
  readonly character: CharacterDetail;
}

/** One `iterate` round: the refinement rewrite + the analyze that judged it, plus the bumped counter. */
export interface IterateResult {
  readonly rewrite: RefineryRun;
  readonly analyze: RefineryRun;
  readonly iterationCount: number;
}
