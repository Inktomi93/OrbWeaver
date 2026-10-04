// domain/refinery/contract/results — every verb's result/view shapes. The RUN and SUMMARY wire views are
// `@orb/contracts/refinery`'s (one home); the FULL session view lives HERE because it carries
// `originalCard: CharacterCard` — the refinery CONTRACTS namespace may not import `#character` (its
// import-direction law), while this domain-tier contract may (type-only, downward). The tRPC client types
// flow from the router either way.

import type { CharacterCard, CharacterDetail } from "@orb/contracts/character";
import { characterCardViewSchema, characterDetailSchema } from "@orb/contracts/character";
import type {
  RefinableField,
  RefineryRewriteDecisions,
  RefineryRewriteField,
  RefinerySelection,
  RefinerySessionStatus,
  RefineryStageConfig,
} from "@orb/contracts/refinery";
import {
  refinableFieldSchema,
  refineryRewriteDecisionsSchema,
  refinerySelectionSchema,
  refinerySessionStatusSchema,
  refineryStageConfigViewSchema,
} from "@orb/contracts/refinery";
import type { CharacterId, CharacterSnapshotId, ModelId, RefinerySessionId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

export type { IterateResult, PreflightResult, SchemaForgeResult, StagePreflight } from "@orb/contracts/refinery";

/** A held ROUND CLAIM (#1568) — what `substrate/round-claim.ts::takeRoundClaim` hands back and what
 *  `releaseRoundClaim` requires. The deadline is the claim's IDENTITY, not merely its expiry: the release is
 *  matched on it, so a round whose lease already lapsed cannot clear its successor's claim. */
export interface RefineryRoundClaim {
  readonly leaseUntil: number;
}

/** The summarize-slot FACTS one refinery call reads off the owner's bundle (`substrate/summarizer.ts`):
 *  which model answers and how wide its window is. Read per call, never boot-frozen. */
export interface SummarizerFacts {
  readonly model: ModelId;
  /** The resolved model's context window (tokens); `null` when the capability declares none. */
  readonly contextTokens: number | null;
}

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
  /** The review's Keep/Discard sheets, keyed by rewrite run id — what the workbench reopens with. */
  readonly rewriteDecisions: RefineryRewriteDecisions;
  readonly guidance: string | null;
  readonly iterationCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Why one accepted entry was REFUSED — itemized per entry so the user learns which field and why; any
 *  refusal refuses the whole apply (nothing is half-written). A closed axis so the client renders typed copy. The
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
  /** A greeting CLEAR that would leave the card with zero greetings. Emptying a field is refining; leaving
   *  a character with no first message is a worse authoring state than any empty field, so the last
   *  surviving slot refuses rather than being written away (schema-renderer §15.2). */
  "would_leave_no_greeting",
  /** An APPEND that would push the card past the greetings ceiling (`GREETING_SLOTS_MAX`). Itemized rather
   *  than thrown, and rather than letting the constructed patch fail `updateCharacterSchema`: a card at its
   *  ceiling is a legal card, so a payload wanting one more slot is a refusal about THIS entry (F-T1). */
  "greeting_cap_reached",
  /** The MERGE CONFLICT (schema-renderer §21 edge 2): the LIVE card's text for this field differs from
   *  the session's `original_card` pin — someone edited it under the session — and the accept carried no
   *  `confirmDiverged`. Never written blind: the surface re-opens the block as a BASE·LIVE·REWRITE
   *  conflict and the re-confirmed accept passes. */
  "diverged_since_session",
] as const;
export type ApplyDropReason = (typeof APPLY_DROP_REASONS)[number];

/** What an applied entry DID. The emptying arm makes this load-bearing: destruction must be itemized
 *  separately from replacement so the outcome panel and the audit trail state it explicitly rather than
 *  leaving a user to infer it from a diff with a blank side (schema-renderer §15.5). `added` is the F-T1
 *  append arm's twin — a NEW greeting slot is not a replacement of anything, and reporting it as one would
 *  make the outcome panel lie about which slot moved. Same posture as the drop reasons: the tuple stays
 *  unexported until a runtime consumer exists. */
const APPLIED_FIELD_KINDS = ["replaced", "cleared", "added"] as const;
export type AppliedFieldKind = (typeof APPLIED_FIELD_KINDS)[number];

/** Where an itemized entry POINTED. The two indexes are mutually exclusive and neither is a spelling of the
 *  other: `greetingIndex` names a slot the card HAS, `appendIndex` names the k-th NEW greeting a rewrite
 *  payload asked for (`appendedRewrites`' ordinal — the only stable address a slot-less entry can carry). */
interface RefineryFieldRef {
  readonly field: RefinableField;
  readonly greetingIndex?: number | undefined;
  readonly appendIndex?: number | undefined;
}

export interface AppliedFieldRef extends RefineryFieldRef {
  readonly kind: AppliedFieldKind;
}

export interface DroppedField extends RefineryFieldRef {
  readonly reason: ApplyDropReason;
}

/** One accept's belt verdict (the shared accept-belts substrate's output — both terminal verbs consume
 *  it; homed here per §7.4, the one type home). */
export type AcceptVerdict = { readonly kind: "apply"; readonly entry: RefineryRewriteField } | { readonly kind: "drop"; readonly drop: DroppedField };

/** The belt inputs one apply call classifies every accept against (derived once, up front — the
 *  accept-belts substrate's contract). */
export interface AcceptBelts {
  readonly rewriteFields: readonly RefineryRewriteField[];
  readonly selectedFields: readonly string[];
  /** The selection's greeting-index narrowing — `undefined` means every greeting is in scope (contracts
   *  law). When it IS an array, an accept for a greeting index outside it is scope-widening past what the
   *  user selected (belt 9). */
  readonly selectedGreetingIndexes: readonly number[] | undefined;
  readonly liveGreetingCount: number;
  readonly liveHasDepthPrompt: boolean;
  /** The payload's APPEND entries in payload order (`appendedRewrites`) — the list an accept's
   *  `appendIndex` addresses into. Derived once, up front, exactly like the rest of this bundle. */
  readonly appendedFields: readonly Extract<RefineryRewriteField, { append: true }>[];
  /** The §21 divergence pair: the session's pin and the card the write would land on. */
  readonly originalCard: CharacterCard;
  readonly liveCard: CharacterCard;
}

export interface ApplyFieldsResult {
  readonly applied: readonly AppliedFieldRef[];
  readonly dropped: readonly DroppedField[];
  /** The updated character detail (the injected `character.update`'s own return) — the client's refresh. */
  readonly character: CharacterDetail;
  /** The pre-apply snapshot's id (schema-renderer §16.2's result widening) — the immediate "view the
   *  rollback point" affordance. Null on exactly the zero-write arm, where NO snapshot was taken (the
   *  surface states that plainly rather than leaving a missing rollback point unexplained). */
  readonly snapshotId: CharacterSnapshotId | null;
}

/** `applyAsCopy` — the branch-off result: the same itemization, the FRESH character (never the live one),
 *  and no snapshot by construction (nothing existing was written — the outcome copy says so). Null
 *  `character` on the zero-write arm: every accept died on the belts, so no copy was minted. */
export interface ApplyAsCopyResult {
  readonly applied: readonly AppliedFieldRef[];
  readonly dropped: readonly DroppedField[];
  readonly character: CharacterDetail | null;
}

export const refinerySessionViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.refinerySession),
  characterId: typeIdSchema(ID_PREFIX.character),
  name: z.string().nullable(),
  status: refinerySessionStatusSchema,
  originalCard: characterCardViewSchema,
  selection: refinerySelectionSchema.strict(),
  stageConfig: refineryStageConfigViewSchema,
  rewriteDecisions: refineryRewriteDecisionsSchema,
  guidance: z.string().nullable(),
  iterationCount: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<RefinerySessionView>;

const refineryFieldRefShape = {
  field: refinableFieldSchema,
  greetingIndex: z.number().optional(),
  appendIndex: z.number().optional(),
};
const appliedFieldRefSchema = z.strictObject({ ...refineryFieldRefShape, kind: z.enum(APPLIED_FIELD_KINDS) }) satisfies z.ZodType<AppliedFieldRef>;
const droppedFieldSchema = z.strictObject({ ...refineryFieldRefShape, reason: z.enum(APPLY_DROP_REASONS) }) satisfies z.ZodType<DroppedField>;
export const applyFieldsResultSchema = z.strictObject({
  applied: z.array(appliedFieldRefSchema).readonly(),
  dropped: z.array(droppedFieldSchema).readonly(),
  character: characterDetailSchema,
  snapshotId: typeIdSchema(ID_PREFIX.characterSnapshot).nullable(),
}) satisfies z.ZodType<ApplyFieldsResult>;
export const applyAsCopyResultSchema = applyFieldsResultSchema
  .omit({ snapshotId: true })
  .extend({ character: characterDetailSchema.nullable() }) satisfies z.ZodType<ApplyAsCopyResult>;
