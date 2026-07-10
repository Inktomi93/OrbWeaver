// domain/workloads/contract/workload-result — the per-kind RESULT vocabulary: workload-OWNED projections,
// NOT re-exports of the wrapped verb's return (movement table — `domain-no-cross-feature` bars this contract
// from reaching into discovery/memory/etc.; the runner translates the wrapped op's stats INTO these shapes,
// so the workload contract stays stable as the wrapped verbs evolve). `ResultByKind` is the §7.5 exhaustive
// map (a kind without a result entry fails `tsc` at the `Runner<K>` return + the `RUNNERS` Record).
//
// The shapes are deliberately small count/summary objects (what the admin UI shows + the row's `result`
// column stores). A maintenance/backfill kind reports `{ scanned, changed }`; an embed pass reports
// `{ embedded, skipped }`; analytics report `{ written }`; the catalog refresh reports counts ONLY (no
// provider shapes leak — the adapter discipline). The P5/v2 stub kinds carry a
// `{ deferred: true }` marker so a consumer can tell an inert run apart from a zero-work real run.

/** An embeddings pass outcome (text or image) — resumable, so it reports both halves. */
export interface EmbedPassResult {
  readonly embedded: number;
  readonly skipped: number;
}

/** An analytics write pass (themes / cooccurrence / duplicates / distill / csls) — rows written + the
 *  scanned population it derived them from. */
export interface AnalyticsResult {
  readonly scanned: number;
  readonly written: number;
}

/** A maintenance/backfill pass (assets backfill, import) — what it scanned vs actually changed; `dryRun`
 *  echoes the param so the UI labels a validate-only run. */
export interface MaintenanceResult {
  readonly scanned: number;
  readonly changed: number;
  readonly dryRun: boolean;
}

/** The stats reconcile rebuild — owners/characters whose rollups were rewritten from canon. */
export interface ReconcileStatsWorkloadResult {
  readonly owners: number;
  readonly characters: number;
}

/** The model-catalog refresh — COUNTS ONLY (no provider entry shapes leak into the workloads contract).
 *  The one `refresh-model-catalog` workload refreshes BOTH provider catalogs on its daily tick: the
 *  OpenRouter `/models` snapshot (`models`) and the agent-sdk daemon `supportedModels()` map
 *  (`agentSdkModels`). Each lane is best-effort AND INDEPENDENT: one lane's failure never kills the other.
 *  A refreshed lane reports its snapshot size; a FAILED lane reports `null` (distinct from `0`, which is a
 *  real empty catalog — `null` means "this lane could not refresh, stale snapshot served"). The whole run
 *  only fails when BOTH lanes fail (nothing was accomplished). */
export interface CatalogRefreshResult {
  readonly models: number | null;
  readonly agentSdkModels: number | null;
}

/** A deferred (P5/v2-stub) runner's terminal projection — an inert run that completed without doing the
 *  not-yet-built work. `deferred:true` distinguishes it from a real zero-work pass. */
export interface DeferredResult {
  readonly deferred: true;
}

/** One backfill pass's fold (PD-41 sweeps): entities visited × rows actually written/minted. Declared
 *  workload-owned (structurally identical to chat's counts — the adapter discipline; no chat import). */
export interface BackfillPassResult {
  readonly scanned: number;
  readonly changed: number;
}

/** The memory-backfill sweep result: the segment pass (scanned = chats) + the digest pass (scanned =
 *  scope buckets). */
export interface MemoryBackfillResult {
  readonly segments: BackfillPassResult;
  readonly digests: BackfillPassResult;
}

/**
 * The per-kind result map — the §7.5 exhaustiveness pin. `satisfies { [K in WorkloadKind]: unknown }` would
 * be redundant with the `Runner<K>` return constraint, so this explicit map IS the home each runner projects
 * into; `RUNNERS` + `Runner<K>` index it. Add a kind without a `ResultByKind` arm → `tsc` red.
 */
export interface ResultByKind {
  "embed-corpus": EmbedPassResult;
  "embed-assets": EmbedPassResult;
  "distill-characters": AnalyticsResult;
  "compute-themes": AnalyticsResult;
  "memory-backfill": MemoryBackfillResult;
  "group-character-backfill": BackfillPassResult;
  "compute-cooccurrence": AnalyticsResult;
  "find-duplicates": AnalyticsResult;
  csls: AnalyticsResult;
  "assets-backfill": MaintenanceResult;
  "import-st": MaintenanceResult;
  "reconcile-stats": ReconcileStatsWorkloadResult;
  "refresh-model-catalog": CatalogRefreshResult;
  "reconcile-world-state": DeferredResult;
  // The chat-crew CW1 stubs (D59) — deferred until CW2–CW5 land each real runner, which swaps its arm
  // for the committed per-kind summary shape (chat-crew-design/03 §1–4).
  "crew-lorebook-keeper": DeferredResult;
  "crew-card-evolution": DeferredResult;
  "crew-director": DeferredResult;
  "crew-prose-audit": DeferredResult;
  // Expressions + databank STUB kinds (E1 / DB2-tables riders) — deferred until each real runner lands.
  "expressions-sprite-sheet": DeferredResult;
  "databank-ingest": DeferredResult;
  "databank-reindex": DeferredResult;
  // The 10 rpg crew STUB kinds (R1-subset rider) — deferred until each real crew runner lands.
  "rpg-world-gen": DeferredResult;
  "rpg-recap": DeferredResult;
  "rpg-session-distill": DeferredResult;
  "rpg-director": DeferredResult;
  "rpg-lorebook-upkeep": DeferredResult;
  "rpg-illustration": DeferredResult;
  "rpg-npc-portrait": DeferredResult;
  "rpg-scene-plan": DeferredResult;
  "rpg-scene-distill": DeferredResult;
  "rpg-recruit-card": DeferredResult;
}
