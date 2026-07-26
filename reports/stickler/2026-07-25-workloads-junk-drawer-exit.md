# Workloads / runner system — the junk-drawer exit investigation

> Fable-tier architecture investigation, 2026-07-25. Read-only; this report is the only write.
> Charge (owner, verbatim intent): *"the workloads/runner system became a junk drawer and a cop-out —
> rot, and an excuse for not building properly within our architecture. Research and investigate how to
> move OFF that system, now that we know how to properly import from other domains and features
> (compose-injected ops server-side, tRPC ridden directly client-side). This also affects portability
> and serde."*
> Mid-investigation owner calibration (folded in throughout): **(a)** KISS/YAGNI stay SUSPENDED — design
> the maximally extensible shape; **(b)** *"it's not that workloads are bad — it's that some things just
> don't need it"* — the rot claim is about MISUSE, not about queue semantics being illegitimate;
> **(c)** the target shape, owner's words: *"if a domain imports and exports things it should raise a
> SEAM, and the worker SKIMS those seams — leave the logic in the domains"*; **(d)** missing client
> consumers are a known rollback artifact, not a demand signal — `git show legacy-main:` receipts are
> carried per row, and seams with pre-rollback consumers are PRESERVED dormant-by-design, not culled.

Pain-point doc entries this report answers (docs/architecture/Agent-And-Composition-Pain-Points.md):

- **§7 "workloads is a god-domain"** (lines 167–174) — runners owned by other domains, the
  `runner-env.ts` cross-feature hub, jobs organized by mechanism not ownership, a new job touching ~6
  sites. Answered in §1 (census), §3 (target), §5 (migration). Current-tree numbers re-measured below.
- **§7 "Import and export of the same entities live in different places"** (lines 178–183) — answered
  in §4 (portability/serde impact).
- **§7 "The right pattern already exists in-tree but is applied inconsistently"** (lines 186–189, the
  registry shape: thin core + per-thing descriptor) — this report's target shape IS that pattern applied
  to workloads. Also the doc's closing cross-cutting observation (lines 212–220): workloads is the
  archetype of "centralized into one domain that must then know about everyone."
- Workboard triage of the same doc (docs/retro-workboard.md:434–437) confirms §7 STILL LIVE post-purge.

---

## 0. What the system is, measured (current tree)

**The kind axis** — `packages/contracts/src/workloads/index.ts:9-31`: **18 `WORKLOAD_KINDS`**, one of
them a stub (`reconcile-world-state`, `stub:true` at :93). Modes policy map (`WORKLOAD_KIND_MODES`,
:71-96) is tsc-exhaustive. Statuses, sources, cadences, active-status tuple all live here (D34 — db
derives its CHECKs from these tuples, `packages/db/src/schema/workloads.ts:56-71`).

**The domain** — `packages/server/src/domain/workloads/` (58 files, ~2,340 lines):

- `contract/runner-env.ts` — self-described *"the one true cross-feature composition seam"* (:1-4).
  **9 per-feature env sub-interfaces** (`WorkloadEmbeddingsEnv`, `Databank`, `Discovery`, `Import`,
  `Assets`, `Stats`, `Connection`, `Memory`, `Character`) totalling **20 injected ops** + a raw `Cas`
  handle (:116-129). It imports `@orb/contracts/databank` types to spell another domain's op shapes.
- `contract/workload-params.ts` — 18 per-kind Zod schemas in one exhaustive `PARAMS_SCHEMAS` Record
  (:66-85) + an 18-arm hand-written `startWorkloadInput` discriminated union (:90-121).
- `contract/workload-result.ts` — 18-entry `ResultByKind` (:71-90); every result shape is a
  workload-owned projection EXCEPT `IngestRunResult`, which stays home in `@orb/contracts/databank`
  (:6-8 — the header itself cites one-home/D34 as the reason; this exception is the precedent the
  target design generalizes).
- `runners/` — **17 runner files** (18 kinds; `index` kind's runner is `runners/index.ts`). Every
  single one is a 5–25-line wrapper: parse a tunable, `report()` one message, call exactly ONE
  `ctx.env.<feature>.<op>()`, project counts. Zero domain logic lives here (bodies read in full; e.g.
  `runners/csls.ts`, `runners/find-duplicates.ts`, `runners/assets-gc.ts`).
- `substrate/dispatch.ts:30-50` — the static `RUNNERS: { [K in WorkloadKind]: Runner<K> }` map.
- `engine/` — `runner.ts` (claim → dispatch → terminal-stamp state machine), `progress-bus.ts`
  (in-process EventEmitter + 60s replay ring, :13), `reaper.ts` (15s stale-heartbeat sweep →
  `worker_died`, :11), `schedule-tick.ts` (due-schedule enqueue).
- `verbs/` — start/cancel/retry/get/list + 5 schedule verbs. `service.ts` is a clean verb-factory
  composition root.

**The compose wiring** — `packages/server/src/entry/compose/runner-env.ts` (356 lines,
`buildWorkloadRunnerEnv`) + `services.ts:1511-1583`. Notable: `bindBackfillAvatars`
(compose/runner-env.ts:177-208) runs `db.select` over `characters` + per-row CAS probes **at the entry
tier** — domain logic that escaped its domain because the seam demanded a count-only op shape.

**The drivers** — `transport/jobs/workloads-worker.ts` (poll loop), `workload-schedule-scheduler.ts`
(1-min tick over `workload_schedules`), `catalog-refresh-scheduler.ts` (a SECOND, kind-private
scheduler that uses workload rows as its cron ledger, :1-5, :53).

**The transport** — `transport/trpc/routers/workloads.ts`: start/cancel/retry/get/list/subscribe + 5
schedule procedures. `pnpm ast unwired workloads` → **no results** (every procedure has a client
consumer).

**The client** — `packages/client/src/features/workloads/` (23 files): the Workloads settings pane
(list/run/cancel/retry/schedules), the library import/export sections, and the ONE
`workloads.subscribe` SSE adapter (`hooks/use-workload-subscription.ts`). Two exhaustive per-kind
Records (`WORKLOAD_KIND_LABELS` workloads-model.ts:31-50, `WORKLOAD_PARAM_SHAPE_BY_KIND` :157-177).
Cross-feature consumers ride the tRPC procedure directly per the standing rule (hook imports across
features are gate-banned).

**Coupled sites for a new kind, re-measured** (the "~6–7 sites" repo fact, verified — it is worse than
7 when counted honestly): ① `WORKLOAD_KINDS` tuple + ② `WORKLOAD_KIND_MODES` row (contracts) ·
③ `PARAMS_SCHEMAS` + the `startWorkloadInput` union arm (same file, two edits) · ④ `ResultByKind` +
result shape · ⑤ a `Workload<X>Env` op on `runner-env.ts` · ⑥ the runner file · ⑦ the `RUNNERS` map
entry · ⑧ the compose binding (`entry/compose/runner-env.ts` + `services.ts` deps threading) ·
⑨ client `WORKLOAD_KIND_LABELS` + `WORKLOAD_PARAM_SHAPE_BY_KIND` rows · ⑩ the fixtures
(`tests/server/domain/workloads/_support.ts`) + the golden mirror
(`tests/contracts/workloads/index.contract.test.ts`). **Ten distinct touch points across five
packages/tiers for one background job** — and the domain that OWNS the job authors none of its
lifecycle surface in its own tree.

**Pre-purge scale** (legacy-main receipts): `git ls-tree legacy-main
packages/server/src/domain/workloads/runners/` → **32 runners** — the 17 survivors plus 15 purged
(`crew-card-evolution/-director/-lorebook-keeper/-prose-audit`, `expressions-sprite-sheet`,
`rpg-director/-illustration/-lorebook-upkeep/-npc-portrait/-recap/-recruit-card/-scene-distill/
-scene-plan/-session-distill/-world-gen`). The purged class was the queue's heaviest producer family:
crew enqueued on a turn-completed cadence (`legacy-main:domain/crew/verbs/on-turn-completed.ts:41`),
expressions enqueued sprite-sheet generation (`legacy-main:domain/expressions/verbs/
generate-sprite-sheet.ts`), rpg fire-and-forgot ~10 kinds (`legacy-main:domain/rpg/contract/
service.ts:414-418`). **These domains are slated for rebuild** (rebuild-era rulings), so the target
design must serve exactly this producer class again — a domain verb that enqueues an async
generation/agent job and returns a workloadId the client tails.

---

## 1. Census with verdicts

Verdict legend, calibrated per the owner's direction:

- **(i) GENUINE-DURABLE** — long-running / off-request-mandatory / cancel-and-progress-meaningful.
  Queue semantics are the right call. Expected survivor class, not an embarrassment.
- **(i-lite) LEGITIMATE-LIGHT** — a real bulk pass that benefits from single-active locking + history,
  but is short enough that the queue is a convenience, not a necessity. Survives the move as a
  domain-owned contribution; costs nothing under the target shape.
- **(ii) QUEUE-OPTIONAL** — "some things just don't need it": a proven or plausible awaited/direct
  twin exists; the queue ride is history/observability only. Per-row decision at its migration stage.
- **(iii) DEAD/STUB** — no runner body.

The structural cop-out — cross-domain calls licensed through the `runner-env` backdoor instead of
proper compose-injected ops at the owning domain's door — is **not any single row**; it is the
topology every row shares. The purge already removed the worst per-row abusers (the rpg/crew class
that used the queue as a generic async executor for turn logic). What remains is mostly legitimate
work wearing the wrong ownership.

| # | kind | owning domain (logic) | producers (enqueue receipts) | duration / nature | queue features ACTUALLY used | result read by | pre-rollback client consumer | verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | `index` | embeddings | run dialog; embed-model-change trigger (services.ts:833-836, bulk force); schedules | minutes+ (GPU embed sweep over corpus+assets); resumable-by-skip (`force=false`) | single-active per (kind,source,owner); cancel; progress; history | row preview only | yes (same pane, survives) | **(i)** |
| 2 | `distill-characters` | discovery | run dialog; schedules | long (LLM per character) | single-active; cancel; history | row preview | yes | **(i)** |
| 3 | `compute-themes` | discovery | run dialog; schedules | seconds–tens of seconds (k-means over digests); `k` knob via `ctx.loadUserSettings` (runners/compute-themes.ts:12) | single-active; history | row preview | yes | **(i-lite)** |
| 4 | `memory-backfill` | chat/memory | import post-settle (services.ts:1513-1520 → both portability descriptors AND `profileImport.enqueueBackfill`); run dialog; schedules | long (segment/digest LLM builds per chat); idempotent hash-diff resume | single-active; cancel; progress; history; bulk purge arm (PD-139b) | row preview | yes | **(i)** |
| 5 | `group-character-backfill` | chat (character mint) | run dialog; schedules | fast sweep, idempotent | single-active; history | row preview | yes | **(i-lite)** |
| 6 | `compute-cooccurrence` | discovery | run dialog (maintenance); schedules | seconds (bulk-only analytics) | bulk single-active; history | row preview | yes | **(i-lite)** |
| 7 | `find-duplicates` | discovery | run dialog; schedules | seconds (pair scan, two arms summed) | single-active; history | row preview | yes | **(i-lite)** |
| 8 | `csls` | discovery (writes via embeddings) | run dialog; schedules | seconds (hub-score compute+writeback) | single-active; history | row preview | yes | **(i-lite)** |
| 9 | `assets-backfill` | assets (logic currently AT ENTRY — compose/runner-env.ts:177-208) | run dialog; schedules | medium (CAS probes per candidate); `dryRun` | single-active; history; dryRun echo | row preview | yes | **(i-lite)** + a re-homing defect |
| 10 | `assets-gc` | assets | run dialog (owner maintenance); schedules | potentially long (whole-CAS mark-sweep, deletes); `dryRun` | bulk single-active (must-have — two concurrent GCs is a corruption class); cancel; history | row preview | yes | **(i)** |
| 11 | `assets-fsck` | assets | run dialog (owner maintenance); schedules | medium–long read-only walk | bulk single-active; history (the REPORT is the product) | row preview (`FsckReport`) | yes | **(ii)** — a report-query in job costume; could equally be a (long) admin query, but history of past fscks has real ops value. Decide at stage C; default keep. |
| 12 | `import-st` | import (driver at entry/import/run-profile-dir-import.ts) | folder-upload route (entry/http/import-tree.ts:236); run dialog | minutes (bulk profile import); off-request MANDATORY; post-settle stats reconcile inside the runner (runners/import-st.ts:19-27) | single-active; cancel; progress; history; 202+subscribe UX | client `use-library-import` + report summary | yes | **(i)** |
| 13 | `import-bundle` | import + portability registry | HTTP routes ONLY (entry/http/import.ts:89-95; import-tree.ts:236); excluded from the dialog (workloads-model.ts:17) | minutes; off-request MANDATORY (202 {workloadId}, staged zip owned by the run) | single-active (serializes one owner's uploads, import.ts:4-5); cancel; progress; terminal event resolves the client tracker (`bundle-workload-tracker.tsx`) | client import report | yes | **(i)** — the archetype of what the queue is FOR |
| 14 | `reconcile-stats` | stats | run dialog; schedules; import-st runner post-settle (via `env.stats`) | seconds–medium (rollup rebuild from canon) | single-active; history | row preview | yes | **(ii)** — the in-request twin ALREADY EXISTS AND RUNS: `reconcileImportStats` calls `reconcileStats(db, {ownerId, now})` directly, awaited, at services.ts:1521-1523. The same op runs both ways today. Keep the kind for the bulk all-owners sweep; the singular path is proven queue-optional. |
| 15 | `refresh-model-catalog` | connection | catalog-refresh-scheduler ONLY (transport/jobs/catalog-refresh-scheduler.ts:33,53) | seconds (two HTTP catalog fetches, allSettled lanes) | history-as-cron-ledger (the scheduler reads the newest row's status/updatedAt to decide due-ness); single-active as double-enqueue guard; retry | the scheduler itself + row preview | yes (pane) | **(ii)** — the queue is being used as a cron ledger for a private periodic job. Legitimate observability ride; wrong ownership. Keep-or-exit is an owner fork (§6 Q2); either way connection owns it after the move. |
| 16 | `reconcile-world-state` | (unowned — v2 memory scope, PD-133) | none (stub hidden from dialog) | no-op `DeferredResult` (runners/reconcile-world-state.ts) | none | nobody | n/a — never live | **(iii)** stub, blocked:PD-133 (Core-Audits-and-Debt.md:57,114) |
| 17 | `databank-ingest` | databank | databank upload/scrape verbs via the injected `enqueueIngest` op (services.ts:1025-1028; domain/databank/verbs/upload.ts:51 — "build-never-blocks") | seconds–minutes per document (chunk→embed→prune); idempotent, crash-retry-safe (runner header) | off-request; single-active per owner; retry; history | audit metadata carries workloadId; generic pane | client databank surfaces are PLANNED work (workboard:454-456), not purge debris — the seam must survive | **(i)** — and the enqueue side is ALREADY the house pattern (an injected op at databank's door). The model row for the whole migration. |
| 18 | `databank-reindex` | databank | databank reindex verb (services.ts:1029-1032); embed-model-change trigger (services.ts:837-839, bulk) | minutes (derived-layer rebuild) + bulk purge arm (PD-139c) | single-active; cancel; history | generic pane | same as #17 | **(i)** |

**Census notes with teeth:**

- **`dependsOn` + `scheduledAt` have never had a server-side producer — on either side of the
  rollback.** Current tree: only the run dialog (`run-workload-dialog.tsx:109`,
  `workloads-run-model.ts`). Legacy-main: `git grep dependsOn legacy-main -- packages/server/src`
  outside workloads/router → empty; same for `scheduledAt`. Even crew's cadence enqueues used plain
  `start` (on-turn-completed.ts:41). Per the owner's addendum this is NOT alone grounds for culling —
  the manual dialog IS a live consumer, and the DAG/deferral engine (persistence/queries.ts:36-53,
  259-292) is built and tested. Verdict: keep, dormant-by-design on the server side, doorway = the
  `start` params it already rides (§6 Q6 records the fork honestly).
- **`workload_schedules` has a live client consumer today** (`schedules-section.tsx`,
  `create-schedule-dialog.tsx` exist in the CURRENT tree — the rollback did not take this surface).
  The schedules machinery is real product surface, not debris.
- **The AGENTS.md domain-map row is stale**: §6 says workloads is what "users, **the indexer**, and
  bulk passes enqueue into" (core/AGENTS.md:226) — the indexer does NOT enqueue; it is direct
  bus-driven (`createEmbeddingsIndexer` + `eventBus.subscribe`, services.ts:683-706). Doc drift to fix
  when the ledger entry for this program is minted.

---

## 2. What the queue actually buys us today — the blunt read

The engine was praised by the contracts audit ("`workloads/contract/` is the template folder",
workboard:501) and the praise is deserved **at the mechanism level**. It is not a setTimeout in a
trench coat. What is real:

- **Durable rows** — a never-deleted `workloads` table (schema header: "the unit of audit + retry +
  observability"); every terminal is stamped status-guarded (persistence/queries.ts:154-176); terminal
  runtime failures also write an audit row (PD-113, engine/runner.ts:140-152).
- **Real concurrency locks** — the pair of partial unique indexes
  (`workloads_mode_active_singular`/`_bulk`, db/schema/workloads.ts:113-124) make a double-enqueue
  impossible at the DB, with the `source` sub-partition for concurrent text/image reindex. This is the
  single most valuable thing in the system and MUST survive any exit.
- **Crash DETECTION, not crash RESUME** — heartbeat (5s) + reaper (15s stale → `worker_died`).
  A crashed run is not resumed; it is tombstoned, and recovery = manual `retry` (a fresh cloned row,
  verbs/retry.ts:1-4) leaning on runner idempotence. Honest, but weaker than the "queue" costume
  suggests.
- **No automatic retry, no backoff.** `retry` is a user verb. The only auto-retry in the whole system
  is the catalog scheduler's 1-hour re-check — implemented OUTSIDE the queue.
- **Progress is ephemeral.** In-process EventEmitter + a 60-second replay ring
  (progress-bus.ts:13-14). A client that reconnects 61 seconds into a 20-minute import sees nothing
  until the next `report()`. Nothing durable ever records progress; single-replica by construction.
- **Concurrency = 1, globally.** The worker runs ONE row to completion before polling the next
  (workloads-worker.ts:206-215; the loop comment at :207 declares sequential-by-design). The per-kind
  locks partition ADMISSION, but execution is a single global lane: **a 20-minute `import-st` head-
  blocks a user's `databank-ingest` for 20 minutes** — upload a document mid-import and RAG "build
  never blocks" blocks anyway. This is the queue's one genuine product defect.
- **DAG + deferral machinery with no server producer ever** (see census note) — built, tested,
  dialog-driven only.
- **Two scheduling systems** — `workload_schedules` + tick, AND the catalog scheduler's private
  row-sniffing cron. The second exists because the first couldn't express "daily after success, hourly
  after failure."
- **On-record data-loss footgun** — `toView` (persistence/queries.ts:89-114) silently returns `null`
  for a row whose params blob fails its kind schema (including an invalid branded TypeID), and
  `list`/`get` silently drop it. A poisoned row is invisible rather than visibly broken.
  (The queue-HEAD path at least fails poison rows in place, :266-273 — the read path does not.)
- **Dead weight in the runner context** — `ctx.roleClients` is bound per dispatched row
  (engine/runner.ts:43) and consumed by ZERO runners (grep over runners/: only
  `compute-themes` touches `ctx.loadUserSettings`; nothing reads `roleClients`).
  `subscribeWorkloadEvents` is exported from the front door with no consumer (the router tails
  `workloadStreamEmitter` directly).

**Verdict:** a well-built single-process JOB TABLE — durable rows, honest locks, cancel, tombstoning —
wearing an enterprise queue's clothes (DAG, deferral, dual schedulers) that today only the admin
dialog wears, with one real execution defect (global serialization) and one real read-path defect
(silent poison-drop). The mechanism deserves to survive. The topology around it does not.

**The actual rot, named precisely:** `contract/runner-env.ts` is a licensed cross-feature backdoor —
its own header brags *"the one true cross-feature composition seam."* Any agent needing another
domain's capability inside async work had a sanctioned alternative to building a proper injected-op
seam at the owning domain's door: add an op to the hub, add a runner, done. That is exactly how 32
runners accreted by the purge, why import logic lives outside the portability core (pain-points §7),
why compose does assets domain logic (runner-env.ts:177-208), and why one background job costs ten
coupled edits across five tiers with zero of them in the owner's tree.

---

## 3. The replacement shape — domains raise seams, the worker skims them

The owner's sketch, made rigorous: **every domain that has bulk/background work exposes it as a
first-class WORKLOAD CONTRIBUTION at its own door; the workloads domain becomes a generic execution
substrate (rows, locks, lanes, worker, cancel, schedules, progress) with ZERO domain knowledge; compose
assembles the contributions into one exhaustive registry the engine dispatches through.** This is the
registry shape the pain-points doc says already exists in-tree (portability core, editor-sections,
chat-surface anchors — §7 lines 186–189) plus the house doctrine "dynamic registries over static maps."

### 3.1 The contribution contract (the seam, exactly)

Home: **`@orb/contracts/workloads`** — this is a cross-boundary (domain↔domain) shape, and per the
one-home table (Spine-TypeScript §5.4) domain↔domain wire shapes live in `contracts`, which every
domain already imports downward. This also dissolves the sideways-type problem: no domain ever imports
`domain/workloads/contract` to contribute.

```ts
// @orb/contracts/workloads (addition — beside the existing WORKLOAD_KINDS/modes/statuses axes)

/** Execution lane — which worker loop runs the row. `interactive` = per-user latency-sensitive
 *  (databank-ingest; the future rpg/crew/expressions generation class). `sweep` = bulk maintenance. */
export const WORKLOAD_LANES = ["interactive", "sweep"] as const;
export type WorkloadLane = (typeof WORKLOAD_LANES)[number];

/** The honest resumability contract — drives the retry affordance + the reaper's messaging.
 *  `idempotent-restart` = a retry re-runs the whole job safely (every current runner).
 *  `none` = retry is destructive/unsafe (refused in UI). `checkpointed` = RESERVED (dormant-by-design
 *  doorway for a future job that persists a cursor; no producer today, named so the shape never
 *  needs a retrofit). */
export const WORKLOAD_RESUME_POLICIES = ["idempotent-restart", "checkpointed", "none"] as const;
export type WorkloadResumePolicy = (typeof WORKLOAD_RESUME_POLICIES)[number];

/** What the engine hands a contribution per dispatch. Deliberately minimal: identity + clock.
 *  (Today's WorkloadRunnerContext also carries roleClients — measured consumer count: zero — and
 *  loadUserSettings — one consumer; both become deps of the owning domain's factory instead.) */
export interface WorkloadRunContext {
  readonly userId: UserId;            // acting user (synthetic "system" for ownerless rows)
  readonly ownerId: UserId | null;    // enumeration scope; null = bulk all-owners
  readonly now: () => number;
}

/** Progress vocabulary — unchanged from today's ReportProgress ({pct?, current?, total?, message?}). */
export type ReportProgress = (progress: WorkloadProgress) => void;

/** ONE domain-contributed job. The params/result TYPES are authored in the OWNING domain's contracts
 *  module (the IngestRunResult precedent, workload-result.ts:6-8, generalized); this interface only
 *  correlates them to the kind. */
export interface WorkloadContribution<K extends WorkloadKind = WorkloadKind> {
  readonly kind: K;
  /** The kind's params schema — the ONE validator (start re-parses; the read path re-parses). */
  readonly params: z.ZodType<WorkloadParamsByKind[K]>;
  readonly lane: WorkloadLane;
  readonly resume: WorkloadResumePolicy;
  /** The run body — a compose-built closure over the OWNING domain's own verbs. No shared env hub. */
  readonly run: (
    ctx: WorkloadRunContext,
    params: WorkloadParamsByKind[K],
    report: ReportProgress,
    signal: AbortSignal,
  ) => Promise<WorkloadResultByKind[K]>;
}

/** The registry the engine dispatches through — assembled ONCE at entry/compose from per-domain
 *  factories. The mapped-type key IS the exhaustiveness pin: a kind with no contribution is a tsc
 *  error AT COMPOSE (the §5.5 dispatch law, kept, with ownership inverted). */
export type WorkloadContributions = { readonly [K in WorkloadKind]: WorkloadContribution<K> };
```

**What stays central vs what moves — the exact split:**

| concern | home after the move | why |
| - | - | - |
| `WORKLOAD_KINDS` tuple + `WORKLOAD_KIND_MODES` + statuses/sources/cadences/lanes | `@orb/contracts/workloads` (unchanged) | D34 — the db CHECKs derive from these; the client's exhaustive Records derive from these; ONE importable union (§5.5). The kind NAME stays a one-line central registration; everything behavioral moves out. |
| `WorkloadParamsByKind` / `WorkloadResultByKind` maps | `@orb/contracts/workloads`, assembled from types IMPORTED from each owning contracts module (`@orb/contracts/databank`, `/discovery`, `/portability`, …) | keeps the client's typed wire + tRPC inference; authorship moves to the owner; intra-`contracts` sibling imports are downward-legal and already practiced (workload-result.ts:10). |
| per-kind params SCHEMA + result shape | the owning domain's contracts module | one home by who needs it; the `IngestRunResult` exception becomes the rule. |
| the runner BODY | the owning domain, as a compose-built contribution factory | the owner's sketch verbatim: logic stays in the domain. |
| `startWorkloadInput` 18-arm hand-written union | DELETED — `start` validates via `contributions[kind].params.parse(params)`; the wire type derives mechanically from `WorkloadParamsByKind` | the union was pure ceremony duplicating `PARAMS_SCHEMAS`. |
| `contract/runner-env.ts` + `entry/compose/runner-env.ts` (356 lines) + `substrate/dispatch.ts` + `runners/` (17 files) | DELETED | the junk drawer itself. |
| rows/locks/worker/reaper/cancel/schedules/progress-bus/verbs/router | `domain/workloads` (unchanged surface, slimmer contract) | the mechanism that deserved to survive. |

### 3.2 The domain side — contribution factories (the "raise a seam" half)

Each owning domain exports ONE standalone compose-built factory (the principal-less-ops factory
pattern already in house use), typed against contracts only:

```ts
// domain/discovery/workload-contributions.ts (NEW — inside the owning domain)
export function createDiscoveryWorkloadContributions(deps: {
  readonly discovery: Pick<DiscoveryService, "computeThemes" | "distillCharacters"
    | "computeCooccurrence" | "computeDuplicatePairs" | "computeChatDuplicatePairs"
    | "computeCharacterHubScores">;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>; // the compute-themes k knob
}): readonly [
  WorkloadContribution<"compute-themes">, WorkloadContribution<"distill-characters">,
  WorkloadContribution<"compute-cooccurrence">, WorkloadContribution<"find-duplicates">,
  WorkloadContribution<"csls">,
] { … }
```

Factory roster (each replaces its `Workload<X>Env` sub-interface + its runner files):

| factory | home | kinds | notes |
| - | - | - | - |
| `createEmbeddingsWorkloadContributions` | domain/embeddings | `index` | absorbs the purge-arm guards (PD-139) the runner carries today |
| `createDiscoveryWorkloadContributions` | domain/discovery | 5 analytics kinds | absorbs the k-knob precedence |
| `createAssetsWorkloadContributions` | domain/assets | `assets-backfill`/`-gc`/`-fsck` | **re-homes the bindBackfillAvatars gather** (compose/runner-env.ts:177-208) into domain/assets where its db reads belong |
| `createStatsWorkloadContributions` | domain/stats | `reconcile-stats` | |
| `createConnectionWorkloadContributions` | domain/connection | `refresh-model-catalog` | pending §6 Q2 |
| `createChatWorkloadContributions` | chat compose product (compose/chat.ts precedent) | `memory-backfill`, `group-character-backfill` | built over `chatCompose.backfill.*`, same wiring, new home |
| `createDatabankWorkloadContributions` | domain/databank | `databank-ingest`/`-reindex` | thin over the existing `DatabankIngest` subsystem |
| `createImportWorkloadContributions` | domain/import | `import-st`, `import-bundle` | takes the bundle/profile-dir drivers + staging root + portability registry as deps (the drivers stay entry-composed ops — they are cross-domain compositions by nature; the CONTRIBUTION and its params/result contract move under domain/import's name) |

Compose then assembles the exhaustive registry — this is the whole remaining "wiring cost" of the
system, and the tsc pin:

```ts
// entry/compose/workload-contributions.ts (replaces runner-env.ts)
const contributions: WorkloadContributions = keyByKind([
  ...createEmbeddingsWorkloadContributions({ embeddings }),
  ...createDiscoveryWorkloadContributions({ discovery, loadUserSettings }),
  …
]); // a kind missing here, or contributed twice, is a compose-time error (keyByKind asserts both)
```

**New-job cost after the move:** ① one tuple member + mode row (+ its params/result type export) in
contracts · ② one contribution in the owning domain (schema + run body + lane/resume — ONE file in the
owner's tree) · ③ one spread already covered by the owner's factory, or one new factory line at
compose · ④ the client label/param-shape rows (tsc-forced by the existing exhaustive Records) ·
⑤ tests in the owner's mirror. **~4 sites, three of them tsc-forced, and the job's brain lives with
its owner.** Down from ten sites in five tiers.

### 3.3 The worker side (the "skims the seams" half)

- `WorkloadRunnerDeps.env` (the god-hub) is replaced by `contributions: WorkloadContributions`;
  `dispatchAndRun` (engine/runner.ts:32-35) indexes the injected registry instead of the static
  `RUNNERS` import. The two-cast bridge stays exactly where it is (the ONE sanctioned union-correlation
  escape).
- **Two lanes**: the worker runs one poll loop per `WorkloadLane` (N=1 each to start; N is a per-lane
  dep). A new `lane` column on `workloads` (CHECK derived from `WORKLOAD_LANES`, D34 style), stamped at
  enqueue from the contribution, so the queue-head query is lane-scoped and lane assignment survives
  restart. Fixes the head-blocking defect (§2) — a databank-ingest never waits behind an import-st.
  All existing lock semantics unchanged (locks are admission; lanes are execution).
- **Durable progress snapshot**: `report()` additionally upserts the latest `WorkloadProgress` into a
  `progress` JSON column (throttled by the existing 5s heartbeat cadence — piggyback the same UPDATE).
  The 60s replay ring stays for live-tail smoothness; the row becomes the reconnect truth. Client
  `list` rows can then render progress without an active subscription. (Dormant-by-design beneficiary:
  the rebuilt rpg/crew/expressions surfaces that tail long generation jobs.)
- **Poison-row read path fixed**: `toView` stops silently dropping — a row whose params fail the
  contribution schema surfaces as `{ …row, params: null, poison: true }` so `list`/`get` show a
  visibly-broken row (cancel/retry-able), closing the on-record TypeID data-loss footgun
  (persistence/queries.ts:89-114).
- `WorkloadRunnerContext` slims to `WorkloadRunContext` (drop `roleClients` — zero consumers — and
  `loadUserSettings` — becomes a discovery-factory dep); `bindRoleClients` leaves the engine's
  per-dispatch path entirely.
- `dependsOn`/`scheduledAt`/schedules/cancel/retry/subscribe: **unchanged** — live client consumers
  today, preserved seams for the rebuild-era producers.

### 3.4 The client arm

Unchanged in law: features ride `trpc.workloads.*` directly; the pane derives everything from the
contracts tuples (workloads-model.ts:1-2 already promises "a kind flipping stub→built needs zero
client edits"). Two additions when their producers land (doorways named now, per the no-shorted-seams
direction):

- the third cross-feature subscriber hoists the SSE-envelope decode adapter to `client/src/data/`
  (tier-3 commons) — the standing third-consumer rule;
- a lane-aware pane grouping (interactive vs sweep) once the lane column exists — trivial derive from
  the new tuple.

---

## 4. Portability + serde impact

**serde is clean — verified, no quiet dependencies.** `packages/server/src/kit/serde/**` (card, chat,
gallery, persona, tag, theme, user-settings, world-info) has ZERO references to workloads/runner
context (repo grep; the single hit is a comment listing user-settings sections,
kit/serde/user-settings/index.ts:32). Serde is pure functions over bytes/rows; nothing in the move
touches it, and nothing in it breaks when runnerEnv dies.

**The portability core is already the target pattern** — `@orb/contracts/portability` is the
entity-agnostic descriptor registry (PortableEntity {kind, dir, ext, exportAll, importFile};
PORTABLE_IMPORT_ORDER) this report's contribution seam imitates. Untouched by the move.

**How import/export/backfill thread through runnerEnv TODAY:**

- Export: fully synchronous, registry-driven streaming (`entry/http/export.ts` iterates the injected
  `PortabilityRegistry` into one zip). No workload involvement. Clean.
- Import: the HTTP routes stage bytes then enqueue (`import-bundle` at import.ts:89-95; folder uploads
  sniffed into `import-st` or `import-bundle{source:"dir"}` at import-tree.ts:236); the runner-env
  binds `importBundle` (over `runBundleImport`/`importStagedArchive` + the lazy
  `getPortabilityRegistry` thunk, compose/runner-env.ts:216-244) and `importAll` (over
  `runProfileDirImport`, :129-170) with the staging-containment belts (`resolveStagedPath` /
  `rmContained`).
- **The smoking-gun duplication**: `services.ts` passes the IDENTICAL ten-dep profile-import slice
  TWICE — once into `buildPortabilityRegistry` (:1540-1550) and once into `runnerEnv.profileImport`
  (:1571-1582) — character, storeAvatar, attachCardTag, importLorebook, linkCarriedBooks,
  bulkImportChats, bulkImportPersonas, enqueueBackfill, reconcileImportStats, resolveOwnerPrincipal.
  Two consumers of one slice because the import brain is split between the portability descriptors and
  the god-hub.
- The post-import `memory-backfill` enqueue (`enqueueImportBackfill`, :1513-1520) is threaded into
  BOTH consumers as an injected op — already house-pattern-shaped; only its plumbing is duplicated.

**After the move:**

- `createImportWorkloadContributions` (domain/import) takes ONE deps object: the bundle/profile
  drivers, the staging root, `getPortabilityRegistry`, and the profile-import slice — built ONCE at
  compose and shared with `buildPortabilityRegistry`. The duplicate block dies.
- The staging containment belts (`resolveStagedPath`/`rmContained`) move WITH the import contribution
  (they are import logic, not compose logic).
- The HTTP routes keep 202 `{workloadId}` + the client keeps `workloads.subscribe` — no wire change,
  no client change, no serde change; the `PortableEnvelope.schemaVersion` lift-walk is untouched.
- The §7 pain-point asymmetry ("import and export live in different places") resolves to its honest
  minimum: both halves become descriptor-shaped (export = `PortableEntity.exportAll`, import =
  `PortableEntity.importFile` + a domain/import-owned workload contribution for the async bundle run).
  The remaining sync-export/async-import asymmetry is CORRECT, not rot — export streams into the
  response; import writes canon and must survive request death. Named dormant doorway: if huge-library
  export ever needs to go async, it is one `export-bundle` contribution in domain/export — the seam
  exists, no retrofit.

---

## 5. Migration order — staged, one lane each, scoped proofs

Standing sweep for EVERY stage (the coupled-site checklist, updated): contracts tuple/modes + the
golden mirror `tests/contracts/workloads/index.contract.test.ts` (pnpm check does NOT run it — battery
required) · workloads fixtures `tests/server/domain/workloads/_support.ts` (seed REAL branded ids —
the TypeID silent-drop) · client model Records · test-layout mirrors move with any file move ·
dep-cruiser (no new sideways edges) · whole `pnpm check` + battery at the orchestrator, scoped proofs
in-lane.

**Stage A — mint the seam, behavior-identical.**
Add `WorkloadContribution`/`WorkloadContributions`/lanes/resume tuples to `@orb/contracts/workloads`;
swap the engine to an injected registry (`WorkloadRunnerDeps.env` → `.contributions`); compose
initially wraps the EXISTING runner-env ops in shim contributions so every kind behaves byte-identically.
Proves: registry dispatch + the compose-time exhaustiveness pin (probe: delete one entry → tsc red at
compose; add a 19th kind with no contribution → red). Engine tests move to fake contributions.

**Stage B — the pure-wrapper domains move: discovery + embeddings + stats + connection.**
9 kinds. Factories in their domains; params/result types promoted to the owners' contracts modules;
delete `WorkloadDiscoveryEnv`/`Embeddings`/`Stats`/`Connection` sub-envs + their runner files.
Decide §6 Q2 (catalog refresh) here. Proves: runner test mirrors re-homed; compose/runner-env.ts
shrinks by ~half; no wire change (cross-tenant sweep untouched).

**Stage C — assets + chat sweeps.**
`assets-backfill/gc/fsck` with the entry-tier gather re-homed into domain/assets (int-test the gather
in its new home); `memory-backfill` + `group-character-backfill` off the chat compose product. Decide
§6 Q1 fsck posture. Proves: the compose file no longer contains a single `db.select`.

**Stage D — databank + import; delete the junk drawer.**
Databank contributions (trivial — the enqueue side is already the house pattern); import contributions
with the staging belts + the de-duplicated profile-import slice. Then DELETE:
`domain/workloads/contract/runner-env.ts`, `entry/compose/runner-env.ts`,
`domain/workloads/substrate/dispatch.ts`, `domain/workloads/runners/` (all 17), and the services.ts
duplicate block — in the SAME commit (half a migration IS the rot, banned-escape-hatch #5). Proves:
e2e import smoke (bundle zip + folder upload land, tracker resolves) · the observability harness
landing check (`/api/_debug`) · cross-tenant sweep re-run (router unchanged but re-prove) ·
`pnpm ast reaches runner-env` → nothing.

**Stage E — substrate upgrades + ledger.**
Two-lane worker + `lane` column (+ CHECK + golden mirror + fixture sweep) · durable `progress` column ·
the poison-row visible-surface fix (+ a test that a bad-TypeID row is VISIBLE, not vanished) · drop
`roleClients` from the run context + the dead `subscribeWorkloadEvents` export · fix the AGENTS.md §6
indexer drift · mint the D-entry ("workload contributions: domains raise the seam, the worker skims
it; runner-env retired") + retire PD-18's runner-path phrasing.

Sizing: A/B/C/D/E are each one executor-lane of work with scoped proofs; B is the widest (9 kinds) but
purely mechanical after A proves the shape. A→B ordering is load-bearing (shims first = every later
stage is a pure move, never a behavior change). D is the only stage that touches security-adjacent
surface (staging paths, CSRF-guarded routes are untouched but re-proven) — route its review through
security-executor per house rule.

---

## 6. Open questions (owner) — genuine forks only

1. **`assets-fsck`**: keep as a job (history of integrity reports; long walks on big CAS) or demote to
   a direct owner-only admin query? Recommendation: keep — the report history has ops value and costs
   one contribution under the new shape.
2. **`refresh-model-catalog`**: (a) keep as a connection-owned contribution + leave the private
   scheduler reading rows as its cron ledger (zero behavior change), or (b) exit the queue entirely —
   the scheduler calls `connection.refreshCatalogSnapshot` directly and due-ness keys off the catalog
   snapshot's own fetched-at, losing the pane history/retry affordance. Recommendation: (a); the
   observability ride is real and the ownership problem is solved by the move itself.
3. **`reconcile-world-state`**: keep the reserved kind as an inert workloads-registered stub
   contribution until PD-133 mints its owner (tuple stability, no migration), or drop it from the
   tuple until the v2 spec exists (a kind removal touches the db CHECK + golden mirror)?
   Recommendation: keep reserved — removal buys nothing and re-adding is the ten-site cost this
   program exists to kill (four-site after, but still churn).
4. **`reconcile-stats` singular**: additionally expose the already-proven direct awaited path as a
   plain stats tRPC mutation (instant "recompute my stats" UX) while the kind stays for bulk sweeps —
   or leave singular runs on the queue only? Recommendation: expose both; the direct twin already runs
   in production (services.ts:1521-1523).
5. **Lane count**: ship exactly two lanes (`interactive`/`sweep`, N=1 each) or make N-per-lane a
   config knob now? Recommendation: two lanes, N injected-but-defaulted-to-1 — the seam is the tuple +
   column; widening N later is a dep default, not a migration.
6. **`dependsOn`/`scheduledAt`**: no server producer has ever existed on either side of the rollback
   (census note, legacy-main receipts) — but the run dialog consumes both and the rebuild-era
   producers (crew cadences, rpg chains) are the plausible future writers. Keep as-is (recommended,
   per lock-the-extensible-shape + the addendum), or ratify explicitly so nobody re-litigates them as
   rot next audit? Either way the answer belongs in the stage-E D-entry.
7. **Durable progress column**: stage E as designed, or defer to the first rebuilt long-generation
   producer? Recommendation: stage E — the reconnect blindness already bites today's 20-minute imports
   (60s ring, §2), not just future producers.

---

## Appendix — receipt index (primary evidence)

- god-hub: `packages/server/src/domain/workloads/contract/runner-env.ts:1-4,116-129`
- runner thin-wrappers: `domain/workloads/runners/*.ts` (17 files, read in full)
- static dispatch: `domain/workloads/substrate/dispatch.ts:30-50`
- engine state machine: `domain/workloads/engine/runner.ts:32-35,43,159-199`
- sequential worker: `transport/jobs/workloads-worker.ts:206-215`
- progress ring TTL: `domain/workloads/engine/progress-bus.ts:13`
- reaper: `domain/workloads/engine/reaper.ts:11-39`
- poison silent-drop: `domain/workloads/persistence/queries.ts:89-114` (vs fail-in-place :266-273)
- locks: `packages/db/src/schema/workloads.ts:113-124`; schedules table :146-183
- start/mode gate: `domain/workloads/verbs/start.ts:22-42`; retry clone: `verbs/retry.ts:1-4`
- compose: `entry/compose/runner-env.ts:129-170,177-208,216-244,247-355`;
  `entry/compose/services.ts:811-840,998-1037,1511-1583` (duplicate slice :1540-1550 vs :1571-1582)
- enqueue sites: services.ts:833-839 (settings trigger), :1025-1032 (databank ops), :1513-1520
  (import backfill); `entry/http/import.ts:89-95`; `entry/http/import-tree.ts:236`;
  `transport/jobs/catalog-refresh-scheduler.ts:33,53`; `engine/schedule-tick.ts:16-37`
- router + subscribe: `transport/trpc/routers/workloads.ts:35-101,171-196`
- client: `features/workloads/lib/workloads-model.ts:13-23,31-50,157-177`;
  `hooks/use-workload-subscription.ts:1-10`; `components/run-workload-dialog.tsx:109`
- portability core: `packages/contracts/src/portability/index.ts:73-88`
- serde purity: repo grep over `packages/server/src/kit/serde` (one comment hit, zero code refs)
- legacy-main: `git ls-tree legacy-main …/runners/` (32); `crew/verbs/on-turn-completed.ts:41`;
  `expressions/verbs/generate-sprite-sheet.ts`; `rpg/contract/service.ts:414-418`; dependsOn/
  scheduledAt producer greps (empty)
- pain-points: `docs/architecture/Agent-And-Composition-Pain-Points.md:167-189,212-220`;
  workboard triage `docs/retro-workboard.md:434-437,447-452,501`
- ledger: D4 (runner-env builder home), D23 (workloads ownerId KEEP), D34 (tuple derive);
  PD-18/PD-133 (stub), PD-104/PD-139 (purge+reindex arms), PD-113 (failure audit row)
- doc drift: `docs/architecture/core/AGENTS.md:226` ("the indexer… enqueue" — it doesn't;
  services.ts:683-706)
