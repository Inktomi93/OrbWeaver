// domain/workloads/contract/runner-env — the one true cross-feature composition seam. The typed bundle of
// every cross-feature op the runners depend on; the runtime value is built once at the `entry/` composition
// root and threaded through the worker into every dispatch. Runners reach in via `ctx.env.<feature>.<op>`,
// never a sideways import; each sub-interface is the minimal op subset that feature's runners use.

import type {
  CardEvolutionApplyArgs,
  CardEvolutionRunInputs,
  CardEvolutionRunSummary,
  DirectorApplyArgs,
  DirectorRunInputs,
  DirectorRunSummary,
  KeeperApplyArgs,
  KeeperRunInputs,
  KeeperRunSummary,
  ProseAuditApplyArgs,
  ProseAuditRunInputs,
  ProseAuditRunSummary,
} from "@orb/contracts/crew";
import type { IngestRunResult, ReindexMode, ReindexScope } from "@orb/contracts/databank";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type {
  RpgDirectorApplyArgs,
  RpgDirectorRunInputs,
  RpgDirectorRunSummary,
  RpgLorebookUpkeepApplyArgs,
  RpgLorebookUpkeepRunInputs,
  RpgLorebookUpkeepRunSummary,
  RpgRecapApplyArgs,
  RpgRecapRunInputs,
  RpgRecapRunSummary,
  RpgRecruitCardApplyArgs,
  RpgRecruitCardRunInputs,
  RpgRecruitCardRunSummary,
  RpgSceneDistillApplyArgs,
  RpgSceneDistillRunInputs,
  RpgSceneDistillRunSummary,
  RpgScenePlanRunInputs,
  RpgSessionDistillApplyArgs,
  RpgSessionDistillRunInputs,
  RpgSessionDistillRunSummary,
  RpgWorldGenApplyArgs,
  RpgWorldGenRunInputs,
  RpgWorldGenRunSummary,
} from "@orb/contracts/rpg";
import type { ChatId, DocumentId, MessageVariantId, RpgGameId, RpgNpcId, RpgSceneId, RpgSessionId, UserId } from "@orb/kit/ids";
import type { Cas } from "#infra/storage";
import type { ParamsByKind } from "./workload-params";
import type {
  AnalyticsResult,
  BackfillPassResult,
  BundleImportWorkloadResult,
  CatalogRefreshResult,
  EmbedPassResult,
  FsckReport,
  MemoryBackfillResult,
  ReconcileStatsWorkloadResult,
  RpgIllustrationJobResult,
  RpgNpcPortraitJobResult,
  SpriteSheetJobResult,
} from "./workload-result";
import type { ReportProgress } from "./workload-state";

/** Counts a maintenance/backfill op returns BEFORE the runner adds the `dryRun` echo (→ MaintenanceResult). */
interface MaintenancePassCounts {
  readonly scanned: number;
  readonly changed: number;
}

// Every op a singular-capable kind drives carries an `ownerId: UserId | null` — `null` = the bulk
// all-owners pass, a `UserId` = scoped to that one owner. Bulk-only ops carry no `ownerId`.

/** embeddings.* — the one vector write path's bulk passes. `force` re-embeds matched rows (else resumable skip). */
export interface WorkloadEmbeddingsEnv {
  readonly embedCorpus: (args: { ownerId: UserId | null; force: boolean; signal: AbortSignal }) => Promise<EmbedPassResult>;
  readonly embedAssets: (args: { ownerId: UserId | null; force: boolean; signal: AbortSignal }) => Promise<EmbedPassResult>;
  /** PD-139(b): reclaim the OLD chat-memory embed space (`chat_segments`/`chat_digests`) after a BULK
   *  memory-backfill. The memory-backfill runner calls it only for the box-global pass, after the sweep,
   *  and never on abort — the bulk-only + skip-on-abort guard the embedCorpus/embedAssets purge also uses. */
  readonly purgeMemoryVectors: () => Promise<void>;
  /** PD-139(c): reclaim the OLD document embed space (`document_chunks`) after a BULK databank-reindex
   *  re-embeds every chunk into the box's active space. The databank-reindex runner calls it only for the
   *  box-global (`ownerId === null`) pass, after the sweep, and never on abort — the same bulk-only +
   *  skip-on-abort guard. */
  readonly purgeDocumentVectors: () => Promise<void>;
}

/** databank.* — the document-RAG ingest passes (chunk→embed→prune), reached through the injected env so the
 *  runner never touches `document_chunks` or the databank tables directly. `ingest` handles ONE freshly
 *  uploaded document (the post-upload lane); `reindex` re-runs the derived layer for one document or every
 *  document of an owner (`ownerId === null` = the box-wide bulk sweep). Both report an {@link IngestRunResult}. */
export interface WorkloadDatabankEnv {
  readonly ingest: (args: { documentId: DocumentId; signal: AbortSignal }) => Promise<IngestRunResult>;
  readonly reindex: (args: { ownerId: UserId | null; scope: ReindexScope; mode: ReindexMode; signal: AbortSignal }) => Promise<IngestRunResult>;
}

/** discovery.* — the semantics passes. `computeHubScores` computes then writes back internally — workloads
 *  sees one op. `computeCooccurrence` is bulk-only. */
export interface WorkloadDiscoveryEnv {
  readonly computeThemes: (args: { ownerId: UserId | null; k: number; signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly distillCharacters: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly computeCooccurrence: (args: { signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly findDuplicates: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<AnalyticsResult>;
  readonly computeHubScores: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<AnalyticsResult>;
}

/** import.* — the two import passes, both create-kind (`ownerId` is the target, never `null`). `importAll`
 *  is the ST bulk profile loop; `importBundle` reads one staged portability zip. */
export interface WorkloadImportEnv {
  readonly importAll: (args: {
    ownerId: UserId;
    dryRun: boolean;
    /** A staged folder-upload override (a token resolved under the staging root); absent ⇒ the env default
     *  ST profile dir. The folder-import route enqueues this for a picked ST profile/`data` tree. */
    stagedDir?: string;
    signal: AbortSignal;
  }) => Promise<MaintenancePassCounts>;
  readonly importBundle: (args: {
    ownerId: UserId;
    token: string;
    /** `"zip"` (default) reads the staged single archive; `"dir"` reads a staged folder-upload tree (the
     *  token names a directory under the staging root, consumed via `stageDirectory`). */
    source?: "zip" | "dir";
    signal: AbortSignal;
  }) => Promise<BundleImportWorkloadResult>;
}

/** assets.* — the GC/backfill/fsck maintenance verbs that run as workloads. `collectGarbage` is the
 *  grace-windowed mark-sweep GC; `fsck` is the read-only integrity report (both global, no per-owner concept). */
export interface WorkloadAssetsEnv {
  readonly backfillAvatars: (args: { ownerId: UserId | null; dryRun: boolean; signal: AbortSignal }) => Promise<MaintenancePassCounts>;
  readonly collectGarbage: (args: { dryRun: boolean; signal: AbortSignal }) => Promise<MaintenancePassCounts>;
  readonly fsck: (args: { signal: AbortSignal }) => Promise<FsckReport>;
}

/** stats.* — the rollup rebuild from canon (the `reconcile-stats` workload + the import post-settle). */
export interface WorkloadStatsEnv {
  readonly reconcileStats: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<ReconcileStatsWorkloadResult>;
}

/** connection.* — the provider catalog snapshot refreshes, counts only (no provider entry shapes cross into
 *  the workloads contract). Runs both the OpenRouter and agent-sdk catalog refreshes. */
export interface WorkloadConnectionEnv {
  readonly refreshCatalogSnapshot: (args: { signal: AbortSignal }) => Promise<CatalogRefreshResult>;
}

/** memory.* — the corpus-wide memory backfill (enumerates every chat × scope bucket, runs the same
 *  idempotent segment/digest builds the engine's post-turn trigger uses). */
export interface WorkloadMemoryEnv {
  readonly backfill: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<MemoryBackfillResult>;
}

/** character.* — the synthetic group-character backfill; idempotent via the find-first short-circuit. */
export interface WorkloadCharacterEnv {
  readonly backfillGroupCharacters: (args: { ownerId: UserId | null; signal: AbortSignal }) => Promise<BackfillPassResult>;
}

/** chatCrew.* — the chat-crew member runners' seam (chat-crew-design/02 §7). The runner is thin:
 *  `readKeeperInputs` (crew canon-read) → the member module builds messages → `agentTurn` (below) →
 *  `applyKeeperResult` (crew applier). The DATA shapes are contracts-homed (`@orb/contracts/crew`); this
 *  OP bundle lives here (a function bundle isn't wire-serializable, and neither domain may import the other —
 *  compose adapts the crew service onto it). CW2 lands the keeper's three ops; CW3–5 add their reader+applier
 *  pairs (the env grows per chunk, the 9 sibling sub-envs' pattern). */
export interface WorkloadChatCrewEnv {
  /** Resolve one keeper run's inputs; `null` = nothing settled past the protect tail (the runner no-ops). */
  readonly readKeeperInputs: (chatId: ChatId) => Promise<KeeperRunInputs | null>;
  /** Apply the model's parsed payload: mint/attach the book on first write, hand-edit-safe upsert, advance
   *  the high-water mark, emit `keeperRan` + the domain-event mirror. Returns the run summary. */
  readonly applyKeeperResult: (args: KeeperApplyArgs) => Promise<KeeperRunSummary>;
  /** Resolve one director pass's inputs; `null` = director off / no host / no canon yet (03 §3). */
  readonly readDirectorInputs: (chatId: ChatId) => Promise<DirectorRunInputs | null>;
  /** Apply the model's parsed director payload: merge the arc + twist banks into `crew_plots`, write the new
   *  `guidance`, emit `plotUpdated` + the domain-event mirror. Returns the secret-free run summary. */
  readonly applyDirectorPass: (args: DirectorApplyArgs) => Promise<DirectorRunSummary>;
  /** Resolve one card-evolution run's inputs; `null` = nothing settled / no host-owned cast (03 §2). */
  readonly readCardEvolutionInputs: (chatId: ChatId) => Promise<CardEvolutionRunInputs | null>;
  /** Apply the model's parsed card-evolution payload: file each proposal (name→id from the roster), emit the
   *  roster chip + the owner notification, advance the mark. Returns the run summary. */
  readonly applyCardEvolution: (args: CardEvolutionApplyArgs) => Promise<CardEvolutionRunSummary>;
  /** Resolve one prose-audit run's inputs for a variant; `null` = the variant is gone / no host (03 §4). */
  readonly readProseAuditInputs: (chatId: ChatId, variantId: MessageVariantId) => Promise<ProseAuditRunInputs | null>;
  /** Apply the model's parsed prose-audit verdict: `clean` writes no row (emits `auditClean`); `issues` inserts
   *  a proposal (replacing any pending on the variant) + emits the chip + domain-event mirror. */
  readonly applyProseAudit: (args: ProseAuditApplyArgs) => Promise<ProseAuditRunSummary>;
  /** The sealed agent-turn (buddy Option B). The agent role is a per-user connection choice (D67 amendment);
   *  the compose root resolves `resolveRole('agent')` for the host and runs the turn BACKEND-GENERICALLY
   *  (agent-sdk via runAgentTurn, the chat backends via runChatTurn — see entry/compose/crew-turn.ts). Crew
   *  is a tool-less structured turn with no SDK runtime need; `supportsStructuredOutput`/capability fails it
   *  closed where structured output isn't honored. The crew imports NO provider. */
  readonly agentTurn: CrewAgentTurnOp;
}

/** The crew's structured agent turn (chat-crew-design/03 §0 D79 banner). A crew turn is ALWAYS structured —
 *  `responseFormat` is required, not the ABSENT-means-prose optional the wire request carries. */
export interface CrewAgentRequest {
  /** The chat HOST — funds + credentials the turn (D19; the compose root resolves the connection for it). */
  readonly ownerId: UserId;
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly responseFormat: ResponseFormat;
  readonly maxOutputTokens?: number | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** A crew agent turn's egocentric result — just the reply text (`runStructuredTurn` parses it). */
export interface CrewAgentResult {
  readonly text: string;
}

/** The injected agent-turn op the runner closes over for its `run(correction?)` closure. */
export type CrewAgentTurnOp = (req: CrewAgentRequest) => Promise<CrewAgentResult>;

/** rpg.* — the rpg crew runners' seam (rpg-design/06 §3). Mirrors `chatCrew`: the runner is thin —
 *  `read<Kind>Inputs` (rpg canon-read, `null` ⇒ no-op) → the member module builds the prompt → `agentTurn`
 *  (the sealed structured turn, reused verbatim) → `apply<Kind>` (the rpg applier). The runner imports NO rpg
 *  internals (reached only through this bundle) and NO provider. R6 lands world-gen/recap/session-distill;
 *  R7+ add director/lorebook-upkeep/scene/illustration readers+appliers additively (the sibling sub-env pattern). */
export interface WorkloadRpgEnv {
  /** Resolve one `rpg-world-gen` run's inputs; `null` ⇒ the game is gone / not in `setup` (the runner no-ops). */
  readonly readWorldGenInputs: (gameId: RpgGameId) => Promise<RpgWorldGenRunInputs | null>;
  /** Apply the parsed world-gen payload: node map + NPC rows + party sheets + clocks + widgets + loot +
   *  secrets; status → `ready`. Returns the apply counts. */
  readonly applyWorldGen: (args: RpgWorldGenApplyArgs) => Promise<RpgWorldGenRunSummary>;
  /** Resolve one `rpg-recap` run's inputs; `null` ⇒ no prior session to recap / the game is gone. */
  readonly readRecapInputs: (gameId: RpgGameId, sessionId: RpgSessionId) => Promise<RpgRecapRunInputs | null>;
  /** Apply the parsed recap: post the narrator recap message + seed the session's born-committed snapshot. */
  readonly applyRecap: (args: RpgRecapApplyArgs) => Promise<RpgRecapRunSummary>;
  /** Resolve one `rpg-session-distill` run's inputs; `null` ⇒ the session/game is gone. */
  readonly readSessionDistillInputs: (gameId: RpgGameId, sessionId: RpgSessionId) => Promise<RpgSessionDistillRunInputs | null>;
  /** Apply the parsed distill: write the summary → `rpg_sessions`, apply secret progression (empty = carry
   *  forward), and return the staged sheet proposals for host review (→ `applySessionOutcome`). */
  readonly applySessionDistill: (args: RpgSessionDistillApplyArgs) => Promise<RpgSessionDistillRunSummary>;
  /** Resolve one `rpg-director` run's inputs (06 §3 / R7); `null` ⇒ the game is gone / not active / a HUMAN GM
   *  holds the seat (the director never runs at a human-GM table) / no host. */
  readonly readDirectorInputs: (gameId: RpgGameId) => Promise<RpgDirectorRunInputs | null>;
  /** Apply the parsed director pass: evolve the GM-eyes arc + twist bank, tick ≤1 hidden clock, optionally
   *  author a new hidden clock. Returns the SECRET-FREE counts. */
  readonly applyDirectorPass: (args: RpgDirectorApplyArgs) => Promise<RpgDirectorRunSummary>;
  /** Resolve one `rpg-lorebook-upkeep` run's inputs (06 §3 / R7); `null` ⇒ the keeper is off / the session/game
   *  is gone / no host. */
  readonly readLorebookUpkeepInputs: (gameId: RpgGameId, sessionId: RpgSessionId) => Promise<RpgLorebookUpkeepRunInputs | null>;
  /** Apply the parsed keeper entries via the shared `worldInfo.upsertEntries` mint (hand-edit-safe; the book is
   *  minted/attached on first run). Returns the write counts. */
  readonly applyLorebookUpkeep: (args: RpgLorebookUpkeepApplyArgs) => Promise<RpgLorebookUpkeepRunSummary>;
  /** Resolve one `rpg-scene-plan` run's inputs (07 §2.1); `null` ⇒ the game is gone / no host. READ-ONLY crew —
   *  the plan rides the workload RESULT for host review (→ `createScene`), so there is no applier. */
  readonly readScenePlanInputs: (gameId: RpgGameId, seedPrompt: string | null) => Promise<RpgScenePlanRunInputs | null>;
  /** Resolve one `rpg-scene-distill` run's inputs (07 §2.3); `null` ⇒ the scene/game is gone / not active / no host. */
  readonly readSceneDistillInputs: (gameId: RpgGameId, sceneId: RpgSceneId) => Promise<RpgSceneDistillRunInputs | null>;
  /** Apply the parsed scene distill: origin merge message + recentEvents + journal + stamp `concluded`. */
  readonly applySceneDistill: (args: RpgSceneDistillApplyArgs) => Promise<RpgSceneDistillRunSummary>;
  /** Resolve one `rpg-recruit-card` run's inputs (07 §3); `null` ⇒ the npc/game is gone / no host. */
  readonly readRecruitCardInputs: (gameId: RpgGameId, npcId: RpgNpcId) => Promise<RpgRecruitCardRunInputs | null>;
  /** Apply the parsed recruit card: `character.create` → roster add → `rpg_party` row (`provenance:'recruited'`). */
  readonly applyRecruitCard: (args: RpgRecruitCardApplyArgs) => Promise<RpgRecruitCardRunSummary>;
  /** The sealed structured agent turn (buddy Option B) — reused verbatim from the crew turn (the compose root
   *  resolves `resolveRole('agent')` for the host, backend-generically; fails closed without structured output). */
  readonly agentTurn: CrewAgentTurnOp;
  /** R9 (rpg-design/10 §R9 / 08): the two IMAGE workloads delegate the WHOLE pass to rpg (the expressions
   *  sprite-sheet precedent — no model-text payload, so no read/apply split; the imagery call is rpg-internal
   *  via its injected `imagery.generatePicture` op). The runner is thin; rpg composes the prompt (its own
   *  `imagery/prompts.ts`), runs the reuse short-circuit, calls imagery, and writes the row / posts the narrator
   *  message. A capability-lacking run REFUSES honestly (never blocks a turn — 08 §4). */
  readonly runNpcPortrait: (params: ParamsByKind["rpg-npc-portrait"], report: ReportProgress, signal: AbortSignal) => Promise<RpgNpcPortraitJobResult>;
  readonly runIllustration: (params: ParamsByKind["rpg-illustration"], report: ReportProgress, signal: AbortSignal) => Promise<RpgIllustrationJobResult>;
}

/** expressions.* — the sprite-sheet generation pass (expressions-design/03 §3). The runner is thin: it
 *  delegates the whole bulk pass to `runSpriteSheetJob`, whose implementation lives in `domain/expressions`
 *  (the runner-env law: bulk-pass implementations live in their owning feature). The pass reads params
 *  (characterId/labels/style/matte/ownerId), calls imagery + slices + mattes + stores + writes the
 *  `character_sprites` rows, and reports progress; it never touches another domain's db from the runner. */
export interface WorkloadExpressionsEnv {
  readonly runSpriteSheetJob: (params: ParamsByKind["expressions-sprite-sheet"], report: ReportProgress, signal: AbortSignal) => Promise<SpriteSheetJobResult>;
}

/** The full cross-feature op bundle the runner context closes over (`ctx.env`). */
export interface WorkloadRunnerEnv {
  readonly embeddings: WorkloadEmbeddingsEnv;
  readonly databank: WorkloadDatabankEnv;
  readonly discovery: WorkloadDiscoveryEnv;
  readonly import: WorkloadImportEnv;
  readonly assets: WorkloadAssetsEnv;
  readonly stats: WorkloadStatsEnv;
  readonly connection: WorkloadConnectionEnv;
  readonly memory: WorkloadMemoryEnv;
  readonly character: WorkloadCharacterEnv;
  /** The sprite-sheet generation pass (expressions-design/03). */
  readonly expressions: WorkloadExpressionsEnv;
  /** The chat-crew member runners' cross-feature seam (chat-crew-design/02 §7). */
  readonly chatCrew: WorkloadChatCrewEnv;
  /** The rpg crew runners' cross-feature seam (rpg-design/06 §3). */
  readonly rpg: WorkloadRpgEnv;
  /** infra/storage blob bytes — the image-embed pass reads originals through it (NOT feature-owned). */
  readonly cas: Cas;
}
