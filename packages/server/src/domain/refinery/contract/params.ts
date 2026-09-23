// domain/refinery/contract/params — every verb's *Params, declared ONCE. Every verb carries the resolved
// principal; ownership derives through the CHARACTER join off `principal.userId` (D23 — refinery tables
// stamp no owner), never a caller-supplied ownerId.

import type { Principal } from "@orb/contracts/identity";
import type {
  RefinableField,
  RefineryForgeArm,
  RefineryRewritePayload,
  RefinerySchemaDocument,
  RefinerySchemaStage,
  RefinerySelectionPatch,
  RefinerySessionStatus,
  RefineryStage,
  RefineryStageConfig,
} from "@orb/contracts/refinery";
import type { ReportProgress } from "@orb/contracts/workloads";
import type { CharacterId, RefineryRunId, RefinerySchemaId, RefinerySessionId, UserId } from "@orb/kit/ids";

interface RefineryActorParams {
  readonly principal: Principal;
}

export interface StartSessionParams extends RefineryActorParams {
  readonly characterId: CharacterId;
  /** Optional roster label (bounded by `refinerySessionNameSchema` at the verb); absent/null ⇒ unnamed. */
  readonly name?: string | null;
}

export interface GetSessionParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

export type ListSessionsParams = RefineryActorParams;

export interface ListRunsParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

/** The session-config patch (the D62 Setup surface's write). Absent = leave unchanged; `null` on the two
 *  nullable text fields = clear. Each present member is re-parsed through its contracts schema AT THE VERB
 *  (the internal-boundary re-parse posture, security pass §3.A) — the tRPC wire parse does not cover a
 *  future internal caller.
 *
 *  `selection` is a DELTA, not a value — it is the one column `applyFields` also writes (the
 *  greeting-removal remap), so it merges key-wise onto the stored selection instead of replacing it. Its
 *  three-state greeting arm (absent = keep · null = every greeting · array = exactly these) is stated on
 *  `refinerySelectionPatchSchema`. */
export interface UpdateSessionPatch {
  readonly name?: string | null | undefined;
  readonly guidance?: string | null | undefined;
  readonly selection?: RefinerySelectionPatch | undefined;
  readonly stageConfig?: RefineryStageConfig | undefined;
  readonly status?: RefinerySessionStatus | undefined;
}

export interface UpdateSessionParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  readonly patch: UpdateSessionPatch;
}

export interface DeleteSessionParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

export interface RunStageParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  readonly stage: RefineryStage;
  /** OPERATE-BACK (schema-renderer §16.1 — "checkout an earlier commit"): analyze THIS session rewrite
   *  run instead of the latest. Legal only with `stage: "analyze"` (BAD_REQUEST otherwise); a
   *  foreign/absent/wrong-stage id collapses to NOT_FOUND (leak-free). Absent ⇒ latest, unchanged. */
  readonly rewriteRunId?: RefineryRunId | undefined;
}

export interface IterateParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  /** Loop guidance for THIS and later rounds — persisted onto the session (parsed via
   *  `refineryGuidanceSchema`); absent ⇒ the session's stored guidance stands. */
  readonly guidance?: string;
}

/** One user-accepted rewrite entry (the Keep set of the arm-B review). EXACTLY ONE index is legal, and only
 *  on `greetings`: `greetingIndex` addresses a slot the card HAS (asserted at the verb against the LIVE
 *  card — §1 gap 3's verb-tier ruling), `appendIndex` addresses the k-th NEW greeting the chosen rewrite
 *  payload asked for (F-T1 — a slot with no card position yet cannot be named by one). Neither, both, or
 *  either on a non-greetings field is a malformed address and drops with its typed reason. */
export interface AcceptedField {
  readonly field: RefinableField;
  readonly greetingIndex?: number | undefined;
  readonly appendIndex?: number | undefined;
  /** The MERGE-CONFLICT re-confirmation (schema-renderer §21 edge 2): the live card's text for this field
   *  moved since the session's pin, the surface re-opened the block as a three-pane conflict, and the user
   *  explicitly picked the rewrite anyway. Absent on a diverged field ⇒ the verb drops it
   *  (`diverged_since_session`) rather than writing blind — no fast-forward-by-default. */
  readonly confirmDiverged?: true | undefined;
}

export interface ApplyFieldsParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  /** Explicit per-field accept — apply is NEVER automatic and never all-fields-by-default (belt 10). */
  readonly accepts: readonly AcceptedField[];
  /** OPERATE-BACK (§16.1): apply THIS session rewrite run instead of the latest. Same resolution rules
   *  as {@link RunStageParams.rewriteRunId}. */
  readonly rewriteRunId?: RefineryRunId | undefined;
}

/** `applyAsCopy` — the branch-off terminal act (schema-renderer §17): the SAME reviewed accept set, but
 *  the write arm creates a NEW character (duplicate chassis + patch overlay) and the live card is never
 *  touched. `name` defaults to `"<name> (refined)"`. */
export interface ApplyAsCopyParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  readonly accepts: readonly AcceptedField[];
  readonly name?: string | undefined;
  readonly rewriteRunId?: RefineryRunId | undefined;
}

/** `submitManualRewrite` — the hand-authored rewrite arm (og-extension-feedback gap 1): the owner's WIP
 *  edit lands as a rewrite RUN (`{kind:"manual"}` provenance) so analyze can judge it against the anchor
 *  exactly like a model rewrite. Entries parse the SAME typed rewrite contract; an entry outside the
 *  session's selection refuses LOUDLY (the author is the owner — an out-of-scope entry is a client
 *  defect, not a steering attempt to itemize). */
export interface SubmitManualRewriteParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
  readonly fields: RefineryRewritePayload["fields"];
}

/** `scoreSweep` — the LIBRARY score pass (R4 / port study I3). The ONE refinery entry point that takes NO
 *  principal: it is a workload run body, and the queue resolves identity for it (`WorkloadRunContext`), so
 *  the pass takes the ENUMERATION SCOPE the engine hands it. `ownerId: null` IS the box-wide bulk arm — the
 *  same spelling the engine uses — never "an owner I forgot to pass". */
export interface ScoreSweepOptions {
  readonly ownerId: UserId | null;
  /** WHO FUNDS the sweep — the workload's acting user (`WorkloadRunContext.userId`); their `summarize`
   *  binding answers every card in the pass, owner-narrowed or bulk (inference program §7.5-2). */
  readonly funderUserId: UserId;
  /** FILL (false, the default the contribution passes) scores only cards with no score yet; REFRESH (true)
   *  re-scores every card. See `refineScoreSweepWorkloadParams`. */
  readonly rescoreAll: boolean;
  readonly report: ReportProgress;
  readonly signal: AbortSignal | undefined;
}

/** `preflight` — the output-budget readout (schema-renderer §8): resolved per call so a preset edit
 *  shows up on the next read (the D126 discipline). WARN-only; never blocks a run. */
export interface PreflightParams extends RefineryActorParams {
  readonly sessionId: RefinerySessionId;
}

// ── the custom-schema library (R3/SF — the NL design §4.4's verbs) ─────────────────────────────────────

/** The canonical schema document plus the resolved actor. */
export interface CreateSchemaParams extends RefineryActorParams, RefinerySchemaDocument {}

export interface UpdateSchemaParams extends RefineryActorParams {
  readonly schemaId: RefinerySchemaId;
  /** Absent = unchanged. A `schema`/`stage`/`name`/`description` change re-runs the WHOLE document belt
   *  and bumps `version`. */
  readonly patch: {
    readonly name?: string | undefined;
    readonly description?: string | undefined;
    readonly stage?: RefinerySchemaStage | undefined;
    readonly schema?: Record<string, unknown> | undefined;
  };
}

export interface DeleteSchemaParams extends RefineryActorParams {
  readonly schemaId: RefinerySchemaId;
}

export type ListSchemasParams = RefineryActorParams;

/** `generateSchema` — NL → a draft schema document (never persisted; the client holds the draft). `arm`
 *  picks the authoring PIPELINE (task #36 — single enforced call · stepwise · structure-then-hints); absent
 *  = `REFINERY_FORGE_ARM_DEFAULT`. */
export interface GenerateSchemaParams extends RefineryActorParams {
  readonly description: string;
  readonly stage: RefinerySchemaStage;
  readonly arm?: RefineryForgeArm | undefined;
}

/** `refineSchema` — one conversational iteration over the CURRENT draft ("add a severity enum"). */
export interface RefineSchemaParams extends RefineryActorParams {
  readonly schema: Record<string, unknown>;
  readonly instruction: string;
  readonly stage: RefinerySchemaStage;
  readonly arm?: RefineryForgeArm | undefined;
}

/** `testSchema` — a DRILL: run the stage once against an owned card under the draft schema; returns the
 *  payload for preview rendering. Writes NO run row, stamps NOTHING. */
export interface TestSchemaParams extends RefineryActorParams {
  readonly schema: Record<string, unknown>;
  readonly stage: RefinerySchemaStage;
  readonly characterId: CharacterId;
}
