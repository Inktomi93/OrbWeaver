// domain/refinery/contract/service — the typed API surface: context, engine dep, and RefineryService.
// Refinery writes NO `characters.*` column itself: the card read, the signal stamp, the pre-apply snapshot
// and the apply write are all CHARACTER ops injected at the entry root (F6 — character stays the only
// writer; the shapes arrive type-only through character's front door, AGENTS §2). Ownership derives
// through the character join on every read/write (D23 — no `fetchOwned` on refinery tables, no ownerId
// column to scope by; docs/history/design/refinery-r0.md §3.1 / security pass §3.E).

import type { Principal } from "@orb/contracts/identity";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { RefineryRun, RefinerySchemaSummary, RefineryScoreSweepResult, RefinerySessionSummary, RefineryStage } from "@orb/contracts/refinery";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { EmitUserEvent } from "@orb/contracts/user-bus";
import type { Db } from "@orb/db";
import type { SideGenSampling } from "@orb/inference";
import type { RefineryRunId, RefinerySchemaId, RefinerySessionId, UserId } from "@orb/kit/ids";
// Type-only cross-feature SHAPE imports (depcruise domain-no-cross-feature: type-only across features is
// allowed; the runtime ops are wired at the entry composition root).
import type { CharacterService, DeleteSnapshotOp, ListRefineryScoreTargetsOp, LoadOwnedCardOp, StampRefinerySignalsOp } from "#domain/character";
import type {
  ApplyAsCopyParams,
  ApplyFieldsParams,
  CreateSchemaParams,
  DeleteSchemaParams,
  DeleteSessionParams,
  GenerateSchemaParams,
  GetSessionParams,
  IterateParams,
  ListRunsParams,
  ListSchemasParams,
  ListSessionsParams,
  PreflightParams,
  RefineSchemaParams,
  RunStageParams,
  ScoreSweepOptions,
  StartSessionParams,
  SubmitManualRewriteParams,
  TestSchemaParams,
  UpdateSchemaParams,
  UpdateSessionParams,
} from "./params.ts";
import type { ApplyAsCopyResult, ApplyFieldsResult, IterateResult, PreflightResult, RefinerySessionView, SchemaForgeResult } from "./results.ts";

/** The per-OWNER role-client bundle — refinery's only inference surface. Every refinery caller IS the card
 *  owner, so the bundle is theirs; the stages name their task (`structured` for the schema-constrained
 *  passes, `summarize` for prose — inference program §7.5-1). */
type RoleClientsFor = (ownerId: UserId) => Promise<RoleClients>;

/** The side-gen sampling ladder's middle rung — the card owner's default-preset params. The caller of
 *  every refinery verb IS the card owner, so this rung ALWAYS applies (no mixed-owner batch arm here,
 *  unlike distill's library sweep). */
type ResolveUserPresetParams = (userId: UserId) => Promise<SideGenSampling>;

/** The card owner's model-facing PROSE overrides — the 12 refinery slots resolve against these
 *  (PROSE-1 §4.3; the discovery caller-scoped precedent). */
type ResolveUserProse = (userId: UserId) => Promise<ProseOverrides>;

/** The DI bundle the refinery verbs close over (assembled at `entry/compose/refinery.ts`, surfaced via
 *  `context.ts`). */
export interface RefineryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newRefinerySessionId: () => RefinerySessionId;
  readonly newRefineryRunId: () => RefineryRunId;
  readonly newRefinerySchemaId: () => RefinerySchemaId;
  readonly roleClientsFor: RoleClientsFor;
  readonly resolveUserPresetParams: ResolveUserPresetParams;
  readonly resolveUserProse: ResolveUserProse;
  /**
   * The per-user freshness plane (`refineryChanged`) — injected, never a sideways reach at the bus
   * (D38). EVERY persisting verb calls it with the acting owner AFTER its durable write commits; the
   * client's `USER_BUS_FILTERS` row path-invalidates `trpc.refinery` (+ `character.get`, whose F6 signal
   * stamp is deliberately silent), which is what makes a second tab/device reconcile at all.
   *
   * FLAG[emit-is-total] — the emit law, satisfied BY CONSTRUCTION rather than by a classifier: this op is
   * synchronous, `void`-returning and non-throwing (`transport/trpc/user-events-bus.publishUserEvent` →
   * `defineBusChannel.publish`, live-only, no durable row, no FK). The chat bus needs a classify-and-drop
   * wrapper because a `void emit()` over a REJECTABLE durable insert is an unhandled rejection — i.e. a
   * process kill (the delete-mid-turn `chat_events` FK trip). Nothing here can reject, so the ordering rule
   * is the simple one every user-bus producer follows: emit AFTER the commit (a delete emits after the row
   * is gone — there is no durable event row to orphan).
   */
  readonly emitUserEvent: EmitUserEvent;
  /** The owned-card read (character's `cardOf` projection, one-homed there) — session start + apply. */
  readonly loadOwnedCard: LoadOwnedCardOp;
  /** The `characters.refinery` merge-stamp (F6) — score runs stamp `score`, analyze runs `analysis`. */
  readonly stampRefinerySignals: StampRefinerySignalsOp;
  /** `character.snapshot` — the pre-apply reversibility belt ("auto: before refinery apply", §4.13). */
  readonly snapshotCharacter: CharacterService["snapshot"];
  /** The apply path's own retraction (#1551): un-does the belt-13 snapshot above when the conditional
   *  write it was taken FOR refuses `CHARACTER_STALE_BASIS` — the snapshot is the apply's witness, not its
   *  prelude, so a refused apply must leave none behind. */
  readonly deleteSnapshot: DeleteSnapshotOp;
  /** `character.update` — the ONE canon write of an apply; the full character belt runs inside it. */
  readonly updateCharacter: CharacterService["update"];
  /** `character.get` — the detail read for the zero-write apply arm (every accept dropped): a no-op
   *  `update({})` would still run character's whole write path for nothing. */
  readonly getCharacter: CharacterService["get"];
  /** `character.duplicate` — the `applyAsCopy` chassis (schema-renderer §17): what a duplicate carries
   *  (avatar ref, tags, attached books) FOLLOWS that verb's own rulings — one fork-copy law, not two. */
  readonly duplicateCharacter: CharacterService["duplicate"];
}

/** The LIBRARY score sweep pass (R4) — bound at `verbs/score-sweep.ts`, run by the `refine-score-sweep`
 *  workload contribution. Principal-LESS by construction (a queue row is its own actor), so it is not a
 *  `RefineryService` member: the service is the tRPC-facing, principal-taking surface. */
export type ScoreSweep = (opts: ScoreSweepOptions) => Promise<RefineryScoreSweepResult>;

/** What the refinery's OWN background work closes over at `entry/compose` (the contribution-factory seam:
 *  domains raise seams, the worker skims them). Deliberately NOT the whole `RefineryContext`: a sweep has no
 *  session, so it needs no session id minter, no clock, and none of the four apply-path character ops — it
 *  reads the library, asks the model, and stamps. */
export interface RefineryWorkloadDeps {
  readonly roleClientsFor: RoleClientsFor;
  readonly resolveUserPresetParams: ResolveUserPresetParams;
  readonly resolveUserProse: ResolveUserProse;
  /** The sweep's enumeration (injected character op — refinery reads no `characters` row itself). */
  readonly listRefineryScoreTargets: ListRefineryScoreTargetsOp;
  /** The F6 stamp — the sweep's ONE write, the same op every other score run stamps through. */
  readonly stampRefinerySignals: StampRefinerySignalsOp;
  /**
   * The sweep's TERMINAL fan (survey F2 + the #23 import-terminal precedent): ONE `charactersChanged` per
   * owner whose cards this pass actually stamped, emitted once at the end — never per card. The stamp
   * itself stays SILENT (F6, `character/persistence/refinery-ops.ts`); what this announces is that the
   * library's `refineryScore` SORT axis moved, which no mutation exists to hang an `invalidates` on
   * (the writer is a workload). `charactersChanged`, not `refineryChanged`: a sweep opens no session,
   * appends no run and writes no refinery row — the only thing it moved is a character projection.
   */
  readonly emitUserEvent: EmitUserEvent;
}

/** The stage ENGINE — `runStage`'s working half, shared with `iterate` (which runs it twice per round).
 *  Injected at `service.ts` (verb-to-verb value deps are wired explicitly, never sideways-imported — the
 *  discovery `AnalyzeDeps` precedent). Reloads the session per call, so `iterate`'s analyze always sees
 *  the rewrite the same round just landed. */
export type ExecuteStage = (args: {
  readonly principal: Principal;
  readonly sessionId: RefinerySessionId;
  readonly stage: RefineryStage;
  /** True on `iterate`'s rewrite half — the `refinery.refine.system` slot + the latest analyze feedback
   *  ride the prompt (the extension's refinement discipline, study §1.2). */
  readonly isRefinement: boolean;
  /** Operate-back (§16.1): analyze THIS rewrite run instead of the latest. Analyze-only. */
  readonly rewriteRunId?: RefineryRunId | undefined;
}) => Promise<RefineryRun>;

/** The engine dep `runStage` and `iterate` share — ONE instance, wired at `service.ts`. */
export interface StageEngineDeps {
  readonly executeStage: ExecuteStage;
}

/**
 * The refinery surface — the card-refinery pipeline (SCORE → REWRITE → ANALYZE with the anti-drift
 * invariant + the REGRESSION-bearing iterate loop) over durable per-character sessions. Every verb takes
 * the resolved principal; a foreign/absent session or character collapses to NOT_FOUND (leak-free).
 */
export interface RefineryService {
  /** Snapshot the owned card into a new session's `original_card`; selection defaults to the card's
   *  populated refinable fields; config defaults full/balanced/full. */
  readonly startSession: (params: StartSessionParams) => Promise<RefinerySessionView>;
  readonly getSession: (params: GetSessionParams) => Promise<RefinerySessionView>;
  /** The owner's sessions, newest-updated first, with the roster's `latestVerdict` (newest analyze run). */
  readonly listSessions: (params: ListSessionsParams) => Promise<RefinerySessionSummary[]>;
  /** The session's append-only run ledger, oldest first (the D62 CONTEXT Runs tab). */
  readonly listRuns: (params: ListRunsParams) => Promise<RefineryRun[]>;
  /** Patch name/guidance/selection/stageConfig/status — each member re-parsed at the verb. */
  readonly updateSession: (params: UpdateSessionParams) => Promise<RefinerySessionView>;
  readonly deleteSession: (params: DeleteSessionParams) => Promise<void>;
  /** Run ONE stage under the session's in-force config. Analyze requires a rewrite run to judge. */
  readonly runStage: (params: RunStageParams) => Promise<RefineryRun>;
  /** One refinement round: refine-rewrite (analyze feedback in-prompt) → analyze; `iterationCount`++.
   *  Requires an analyze run to refine against. */
  readonly iterate: (params: IterateParams) => Promise<IterateResult>;
  /** Apply the user-accepted entries of the chosen rewrite run (latest, or the operate-back
   *  `rewriteRunId`) to the LIVE card: intersection belts (incl. the §21 divergence check) →
   *  `updateCharacterSchema` re-parse → snapshot-first → `character.update`; drops itemized. */
  readonly applyFields: (params: ApplyFieldsParams) => Promise<ApplyFieldsResult>;
  /** The branch-off terminal act (§17): same belts, but the write mints a NEW character (duplicate
   *  chassis + patch overlay + fresh signal stamp); the live card is untouched and nothing snapshots. */
  readonly applyAsCopy: (params: ApplyAsCopyParams) => Promise<ApplyAsCopyResult>;
  /** The hand-authored rewrite arm (og-feedback gap 1): the WIP edit lands as a `{kind:"manual"}` rewrite
   *  run so analyze can judge it against the anchor exactly like a model rewrite. */
  readonly submitManualRewrite: (params: SubmitManualRewriteParams) => Promise<RefineryRun>;
  /** The output-budget readout (§8) — resolved posture + both fit estimates, WARN-only. */
  readonly preflight: (params: PreflightParams) => Promise<PreflightResult>;
  // ── the custom-schema library (R3/SF — NL design §4.4) ──────────────────────────────────────────────
  readonly listSchemas: (params: ListSchemasParams) => Promise<RefinerySchemaSummary[]>;
  readonly createSchema: (params: CreateSchemaParams) => Promise<RefinerySchemaSummary>;
  readonly updateSchema: (params: UpdateSchemaParams) => Promise<RefinerySchemaSummary>;
  readonly deleteSchema: (params: DeleteSchemaParams) => Promise<void>;
  /** NL → a draft document (never persisted). A double belt failure RESOLVES as the `failed` arm with the
   *  raw last reply — the show-the-partial policy (errors-as-data); provider faults still throw. */
  readonly generateSchema: (params: GenerateSchemaParams) => Promise<SchemaForgeResult>;
  readonly refineSchema: (params: RefineSchemaParams) => Promise<SchemaForgeResult>;
  /** A drill: one stage pass against an owned card under the DRAFT schema; returns the payload for
   *  preview rendering. No run row, no stamps. */
  readonly testSchema: (params: TestSchemaParams) => Promise<Record<string, unknown>>;
}
