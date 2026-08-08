// domain/refinery/contract/service — the typed API surface: context, engine dep, and RefineryService.
// Refinery writes NO `characters.*` column itself: the card read, the signal stamp, the pre-apply snapshot
// and the apply write are all CHARACTER ops injected at the entry root (F6 — character stays the only
// writer; the shapes arrive type-only through character's front door, AGENTS §2). Ownership derives
// through the character join on every read/write (D23 — no `fetchOwned` on refinery tables, no ownerId
// column to scope by; docs/design/refinery-r0.md §3.1 / security pass §3.E).

import type { Principal } from "@orb/contracts/identity";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { RefineryRun, RefinerySessionSummary, RefineryStage } from "@orb/contracts/refinery";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { RefineryRunId, RefinerySessionId, UserId } from "@orb/kit/ids";
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
// Type-only cross-feature SHAPE imports (depcruise domain-no-cross-feature: type-only across features is
// allowed; the runtime ops are wired at the entry composition root).
import type { CharacterService, LoadOwnedCardOp, StampRefinerySignalsOp } from "#domain/character";
import type {
  ApplyFieldsParams,
  DeleteSessionParams,
  GetSessionParams,
  IterateParams,
  ListRunsParams,
  ListSessionsParams,
  RunStageParams,
  StartSessionParams,
  UpdateSessionParams,
} from "./params.ts";
import type { ApplyFieldsResult, IterateResult, RefinerySessionView } from "./results.ts";

/** The bound `summarize` role thunk — refinery's only inference surface (F2: the summarize rung v1). */
type Summarize = RoleClients["summarize"];

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
  readonly summarize: Summarize;
  readonly summarizerModel: string;
  readonly resolveUserPresetParams: ResolveUserPresetParams;
  readonly resolveUserProse: ResolveUserProse;
  /** The owned-card read (character's `cardOf` projection, one-homed there) — session start + apply. */
  readonly loadOwnedCard: LoadOwnedCardOp;
  /** The `characters.refinery` merge-stamp (F6) — score runs stamp `score`, analyze runs `analysis`. */
  readonly stampRefinerySignals: StampRefinerySignalsOp;
  /** `character.snapshot` — the pre-apply reversibility belt ("auto: before refinery apply", §4.13). */
  readonly snapshotCharacter: CharacterService["snapshot"];
  /** `character.update` — the ONE canon write of an apply; the full character belt runs inside it. */
  readonly updateCharacter: CharacterService["update"];
  /** `character.get` — the detail read for the zero-write apply arm (every accept dropped): a no-op
   *  `update({})` would still run character's whole write path for nothing. */
  readonly getCharacter: CharacterService["get"];
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
  /** Apply the user-accepted entries of the LATEST rewrite run to the LIVE card: intersection belts →
   *  `updateCharacterSchema` re-parse → snapshot-first → `character.update`; drops itemized. */
  readonly applyFields: (params: ApplyFieldsParams) => Promise<ApplyFieldsResult>;
}
