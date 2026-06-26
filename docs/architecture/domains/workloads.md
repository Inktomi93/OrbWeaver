# Orbweaver — `workloads`: the execution engine + the one composition seam

> **Status: planning (authoritative detail).** `workloads` is the bulk-work execution engine: a
> durable queue table (`workloads`), the verbs that enqueue/claim/complete/cancel/retry a row, the
> dispatch engine that drives one row through `queued → running → terminal`, and the per-kind
> runners that wrap a domain's bulk pass. It is the substrate the embeddings indexer, the import
> bulk passes, the model-catalog refresh, and the re-index-on-embed-model-change all enqueue into.
> Two things define the target: (1) the **tier split** — the poll loop / worker is a `transport/jobs`
> DRIVER, the queue + engine + runners are the `domain/workloads` LOGIC; (2) **`runner-env` is THE
> cross-feature composition hub** — the typed bundle of injected ops wired at the composition root,
> NOT a junk drawer. The `WorkloadKind` mapped-type `Record` dispatch is the §7.5 GOLD STANDARD and
> is preserved verbatim. neo-tavern was "mostly the right shape here" — this doc confirms it and
> maps it onto the orbweaver tiers, with two real wrinkles (the runner-env op providers re-partition
> under the embeddings/discovery split; the env builder is an `entry/` concern, not `transport/`).
> Authoritative upstream: `structure.md` §3 (server tiers — `transport/jobs` is the driver, the
> domain is the logic), §4 (the 8-slot template), §7 (gates); `_FANOUT-BRIEF.md` §2 (one-directional
> flow), §4 (workloads pain entry), §7.5 (**the `RUNNERS` mapped-type Record gold standard**), §8.1
> (**`workloads/contract/runner-env.ts` is the one true cross-feature hub — model it, keep it**);
> `reports/shared-dissolution.md` (`replay-buffer` → `@orb/kit`, `RoleClients` → `@orb/contracts`,
> `createDefaultRoleClients` DELETED, db-error classifier → `@orb/db/kit`); `domains.md`
> ("the execution engine the indexer + bulk passes enqueue into").

---

## What this domain owns

- **The durable queue table (`workloads`)** — one row per long-running bulk job; the unit of audit +
  retry + observability. Rows are NEVER deleted; they accumulate as the historical record. All
  SELECT/INSERT/UPDATE for this table live in the domain's `persistence/`.
- **The lifecycle verbs** — `start` (enqueue a `queued` row), `cancel` (request stop — `cancelling`
  for a running row, `cancelled` for a queued one), `retry` (clone kind+params+dependsOn into a fresh
  `queued` row; never mutates the original), `get` (one typed row by id), `list` (filter by
  kind/status/owner/since). These are the `WorkloadService` surface the tRPC router calls.
- **The dispatch engine** (`engine/`) — `runWorkload` drives ONE row end-to-end: claim
  (`queued → running`, idempotent), bind the `report` callback, heartbeat, poll for cancel, dispatch
  to the matching runner, catch every outcome (return → `succeeded`, abort → `cancelled`, throw →
  `failed`), stamp the terminal state + emit the bus event. The engine treats every kind uniformly —
  adding a kind requires no engine change.
- **The per-kind runners** (`runners/`) — one thin file per `WorkloadKind`. Each wraps a domain's
  bulk pass through the injected `ctx.env.<feature>.<op>` surface; it owns the per-kind progress
  reporting and the per-kind result projection (NOT a re-export of the wrapped verb's return).
- **The dispatch table** (`engine/dispatch.ts`) — `RUNNERS: { [K in WorkloadKind]: Runner<K> }`. The
  mapped-type `Record` is the exhaustiveness pin: a missing kind is a `tsc` error here.
- **The orphan reaper** (`engine/reaper.ts`) — sweeps in-flight rows whose heartbeat went stale (a
  dead worker) to terminal (`worker_died`/`cancelled`), freeing the kind's active slot so the next
  `start()` of that kind can proceed.
- **The progress/lifecycle bus** (`engine/progress-bus.ts`) — a single per-process `EventEmitter` +
  a per-workload replay ring; the tRPC SSE subscription and the buddy observer fan out from it.
- **The runner-env CONTRACT** (`contract/runner-env.ts`) — the typed interface of every cross-feature
  op the runners depend on. This is the composition seam (the *type*); the runtime value is built at
  `entry/`. (Defined as a contract here; constructed there.)
- **The `WorkloadKind` / params / result / state / error / event vocabularies** — the per-kind
  discriminator union + its `ParamsByKind` / `ResultByKind` maps, the `WorkloadStatus` lifecycle
  tuple, the `WorkloadError` discriminated union, the `WorkloadEvent` bus union, the `Runner<K>`
  signature, and the `WorkloadProgress` snapshot shape.

This domain does **not** own: the **poll loop / worker** (that is `transport/jobs/workloads-worker.ts`
— the DRIVER; it calls DOWN into the domain front door via `runWorkload` / `nextRunnableWorkload` /
`reapOrphanedWorkloads`); the **catalog-refresh scheduler** (that is `transport/jobs` — it decides
WHEN to enqueue a `refresh-model-catalog` row); the **runner-env runtime VALUE** (that is `entry/` —
the composition root is the only tier allowed to cross every feature boundary); the **bulk-pass
implementations themselves** (each lives in its owning feature — `embeddings` owns the embed+store
passes, `discovery` owns themes/hubness/distill/duplicates/cooccurrence, `memory` owns
digest/segment generation, `import`/`assets`/`stats`/`connection` own theirs — reached only through
`ctx.env`); `RoleClients` / `Cas` types (cross-boundary — `@orb/contracts`); the in-memory throttle
or rate-limit anything (none here); the tRPC wire layer (that is `transport/trpc/routers/workloads.ts`).

---

## The tier split — driver (transport/jobs) vs logic (domain/workloads)

`structure.md` §3 names `transport/jobs` as a DRIVER tier — "thin; call DOWN into domain via front
doors only" — exactly analogous to tRPC for the chat verbs. The split is the spine of this doc:

| Concern | Tier | Why |
|---|---|---|
| Poll loop, claim-the-next-row, wake-on-emit, periodic reap tick, graceful-shutdown signal | **`transport/jobs/workloads-worker.ts`** | A long-lived driver. Knows nothing of any kind; calls `nextRunnableWorkload` → `runWorkload` → `reapOrphanedWorkloads` through the domain front door. Crosses ZERO feature boundaries. |
| Decide WHEN to enqueue the daily catalog refresh (boot check + hourly tick) | **`transport/jobs/catalog-refresh-scheduler.ts`** | A recurring driver. Calls `workloads.list` + `workloads.start` through the front door; swallows the single-active conflict as the desired end state. |
| Build the `WorkloadRunnerEnv` from real services (corpus/discovery/embeddings/assets/import/memory/stats/connection) | **`entry/`** (composition root) | The ONE place legitimately allowed to cross every feature boundary — above `domain-no-cross-feature`. **NOT `transport/jobs`** (a driver must not reach sideways into features). |
| The queue table, the verbs, the engine (`runWorkload`/dispatch/reaper/progress-bus), the runners, all contracts | **`domain/workloads`** | The business logic. The engine is the per-row state machine; the runners are the per-kind actions. |

The worker is the analogue of tRPC: a thin driver that validates/sequences and delegates. The engine
(`runWorkload`) stays in the domain because driving one row through its state machine IS the
domain's core logic — the worker just decides which row, and when.

---

## The `WorkloadKind` mapped-type Record (the §7.5 GOLD STANDARD — preserve verbatim)

`workloads.kind` is the reference implementation every other string-union axis in the codebase is
being converted toward. **Do not touch its shape.** Adding a kind is five mechanical edits and the
compiler is the checklist:

```typescript
// contract/workload-kind.ts — ONE canonical union + the runtime tuple (can't drift)
export type WorkloadKind =
  | "embed-corpus" | "embed-assets" | "distill-characters" | "compute-themes"
  | "memory-backfill" | "group-character-backfill" | "compute-cooccurrence"
  | "find-duplicates" | "csls" | "assets-backfill" | "import-st"
  | "reconcile-stats" | "refresh-model-catalog"
  // Seam reservation (council 2026-06-25 — reserve now, build v2): the world-state reconciler.
  // Add with a stub runner so `exhaustive-dispatch` stays green; the feature is v2 (ledger §5,
  // knowledge-cluster.md §9). A `re-index` parameterized kind (embed-model change) is also a candidate.
  | "reconcile-world-state";
export const WORKLOAD_KINDS = [ /* … */ ] as const satisfies readonly WorkloadKind[];

// engine/dispatch.ts — the exhaustiveness pin. A missing kind is a `tsc` error HERE.
export const RUNNERS: { [K in WorkloadKind]: Runner<K> } = { /* kind → runner */ };

// contract/runner.ts — ONE signature; lives in contract/ (NOT engine/) so the runner files
// don't form a cycle with the dispatch table that imports them.
export type Runner<K extends WorkloadKind> = (
  ctx: WorkloadRunnerContext, params: ParamsByKind[K],
  report: (p: WorkloadProgress) => void, signal: AbortSignal,
) => Promise<ResultByKind[K]>;
```

The five edits to add a kind: (1) a new arm in `WorkloadKind` + `WORKLOAD_KINDS`; (2) a params schema
+ `ParamsByKind` entry + `StartWorkloadInput` arm; (3) a result type + `ResultByKind` entry; (4) a
runner file; (5) a `RUNNERS` entry. Miss any of the type-side ones and `tsc` goes red — the
`{ [K in WorkloadKind]: … }` mapped types over `ParamsByKind`/`ResultByKind`/`RUNNERS` are the
backstop. The `dispatchAndRun` two-cast bridge (the index-lookup-through-the-union can't narrow) is
the one sanctioned escape; it is encapsulated in `engine/runner.ts` and is the single seam where the
static guarantee meets the runtime row — keep it there, do not spread it.

This is the **§7.5 target shape** other axes (`messageRole`, `guidedAction`, `routing.source`) are
being reshaped toward. The gate candidate is `exhaustive-dispatch` — a new union member without its
`Record` entry fails the build.

---

## `runner-env` — the ONE true cross-feature composition hub (model it, keep it)

`_FANOUT-BRIEF.md` §8.1 calls `workloads/contract/runner-env.ts` "the one true cross-feature hub (the
composition seam) — model it explicitly, keep it." This is the heart of the domain's target design.

**The model:** runners must do real cross-feature work (embed the corpus, reconcile stats, import a
profile) but `domain-no-cross-feature` bans `domain/workloads/*` from importing
`domain/{embeddings,discovery,import,…}/index.ts`. The resolution is the injection model the whole
codebase uses, concentrated here into ONE typed surface:

1. `contract/runner-env.ts` declares `WorkloadRunnerEnv` — the *types* of every op a runner needs.
2. `entry/` constructs the runtime value once at boot from real service factories (the only tier
   above `domain-no-cross-feature`), and threads it through the worker into every dispatch.
3. Runners reach in via `ctx.env.<feature>.<op>` — never a sideways import.

Adding a runner that wraps a new domain verb = add the op to the bundle + wire it at `entry/`. One
mechanical edit per layer; no rule changes. It is a **structured, named, typed bundle** — explicitly
NOT a junk drawer (each sub-interface — `WorkloadEmbeddingsEnv`, `WorkloadDiscoveryEnv`,
`WorkloadImportEnv`, … — is the minimal op subset that feature's runners use, so the full service
surface never leaks into workloads).

**The orbweaver re-partition (the real wrinkle).** In neo-tavern the bundle has a `corpus` sub-env
that owns BOTH the embed passes and the analytics passes, plus a `chatMemory` sub-env. Under the
orbweaver `embeddings`/`discovery`/`memory` re-architecture (`domains.md`), the op providers move —
`runner-env` is **not a path rename, its field shape changes with the new domain map**:

| neo-tavern field | op | orbweaver provider | orbweaver field |
|---|---|---|---|
| `corpus.createCorpusService` / `embedAndStoreCorpus` (embed-corpus) | embed text sources | **embeddings** (the one write path) | `embeddings.*` |
| `corpus.embedAndStoreImages` (embed-assets) | embed image sources | **embeddings** | `embeddings.*` |
| `corpus.computeThemes` / `computeCharacterSummaries` / `computeCooccurrence` / `computeDuplicatePairs` | analytics | **discovery** (rename of corpus, semantics-only) | `discovery.*` |
| `corpus.compute{Character,Digest,Segment,Image}HubScores` (csls) | hub_score write-back | **discovery** computes, **embeddings** owns the column | `discovery.*` (reads/writes embeddings rows via db) |
| `chatMemory.generateDigests` / `generateSegments` / `ensureGroupCharacter` (→ `mintSyntheticGroupCharacter`) / `resolveCurrentVersionId` (→ `getCard`, D28) | digest/segment gen, group mint | **memory** (a chat subsystem) + **character** (group mint) | `memory.*` / `character.*` |
| `assets.*` / `import.*` / `stats.*` / `models.*` (catalog refresh) / `cas` | unchanged in spirit | assets / import / stats / **connection** (catalog) / infra | path/owner updates only |

The `cas` handle stays at the top level (it's an infra adapter the image-embed pass consumes, not
feature-owned). The `models.refreshCatalogSnapshot` op returns counts only (no provider shapes leak
into the workloads contract) — preserve that adapter discipline.

---

## The 8-slot layout

```
domain/workloads/
├── index.ts                       FRONT DOOR — the only legal external import (the worker + scheduler + buddy + tRPC enter here)
├── service.ts                     COMPOSITION ROOT — wires the 5 verb factories. ZERO logic.
├── context.ts                     DI BUNDLE — explicit WorkloadServiceContext (verb surface: db+log)
│                                    + WorkloadRunnerContext (per-dispatch: db + userId + bound roleClients
│                                    + cached UserSettings reader + env + log). roleClients/binder is a
│                                    REQUIRED entry-wired dep — NO createDefaultRoleClients fallback.
├── contract/
│   ├── service.ts                 WorkloadService interface — read this to know everything the domain does
│   ├── runner.ts                  Runner<K> — ONE signature every runner satisfies (lives here, NOT engine/, to break the cycle)
│   ├── runner-env.ts              WorkloadRunnerEnv — THE cross-feature composition seam (types only; value built at entry/)
│   ├── workload-kind.ts           WorkloadKind union + WORKLOAD_KINDS tuple (the §7.5 canonical axis)
│   ├── workload-params.ts         per-kind Zod schemas + ParamsByKind + StartWorkloadInput discriminated union
│   ├── workload-result.ts         per-kind result types + ResultByKind (workload-OWNED, not verb re-exports)
│   ├── workload-state.ts          WorkloadStatus tuple + ACTIVE_WORKLOAD_STATUSES (mirrors the index WHERE) + WorkloadProgress
│   ├── workload-error.ts          WorkloadError discriminated union (runtime | cancelled | worker_died)
│   └── workload-events.ts         WorkloadEvent bus union (started|progress|status|succeeded|failed|cancelled)
├── verbs/                         ONE verb per file — the WorkloadService surface
│   ├── start.ts                   enqueue (re-parse params; catch the kind-active conflict → DomainConflictError)
│   ├── cancel.ts                  markCancelling (running→cancelling | queued→cancelled | terminal→no-op)
│   ├── retry.ts                   clone kind+params+dependsOn into a fresh queued row (never mutates original)
│   ├── get.ts                     one typed row by id (DomainNotFoundError when absent)
│   └── list.ts                    filter by kind/status/owner/since, newest-first, hard-capped 500
├── persistence/
│   ├── queries.ts                 ALL db access: insert/markStarted/heartbeat/updateProgress/markTerminal/
│   │                                markCancelling/failQueuedRow/load/list/nextRunnable/findStaleInFlight;
│   │                                toView (the typed WorkloadRowAnyKind projection + poison-row tolerance)
│   └── constraints.ts             isActiveKindUniqueViolation — the kind-active marker check OVER the
│                                    @orb/db/kit cause-walk classifier (domain-local predicate; not the walk itself)
├── engine/                        NAMED SUBSYSTEM — the per-row state machine (the "run one workload" logic)
│   ├── runner.ts                  runWorkload — claim → dispatch → catch outcome → stamp terminal → emit
│   ├── dispatch.ts                RUNNERS: { [K in WorkloadKind]: Runner<K> } (the exhaustiveness pin)
│   ├── reaper.ts                  reapOrphanedWorkloads — sweep stale in-flight rows to terminal
│   └── progress-bus.ts           the EventEmitter + per-workload replay ring (consumes @orb/kit/replay-buffer)
│                                    — ASSUMES(single-replica), annotated
└── runners/                       NAMED SUBSYSTEM — one thin runner per WorkloadKind
    ├── embed-corpus.ts            embeddings text pass        ├── csls.ts                    discovery hub_score write-back
    ├── embed-assets.ts            embeddings image pass       ├── assets-backfill.ts         assets avatar re-pair
    ├── distill-characters.ts      discovery summaries         ├── import-st.ts               import bulk loop + post-import reconcile
    ├── compute-themes.ts          discovery k-means           ├── reconcile-stats.ts         stats rollup rebuild
    ├── memory-backfill.ts         memory digest/segment gen   ├── refresh-model-catalog.ts   connection catalog snapshot
    ├── group-character-backfill.ts character group mint       └── compute-cooccurrence.ts / find-duplicates.ts  discovery analytics
```

**Two named subsystems (`engine/` + `runners/`)** — the template permits multiple. `engine/` is the
kind-agnostic state machine; `runners/` is the per-kind action set. The `Runner<K>` signature lives
in `contract/` (not `engine/`) precisely so the runner files depend on the contract for their type
while `dispatch.ts` depends on the contract for the type AND on each runner for the value — no edge
from a runner back to the engine, no cycle.

**`context.ts` — explicit, no `ReturnType<>`:** both `WorkloadServiceContext` and
`WorkloadRunnerContext` become named interfaces (neo-tavern infers them via
`ReturnType<typeof create…>`). The runner context's `roleClients` arrives via an entry-wired binder;
**`createDefaultRoleClients()` (the `_shared/role-clients-binder` reach) is DELETED** — the binder is
a required dep, missing it is a `tsc` error.

---

## Verbs (the `WorkloadService` interface)

```typescript
WorkloadService = {
  start(params: StartWorkloadParams): Promise<{ id: WorkloadId }>
  cancel(params: CancelWorkloadParams): Promise<CancelWorkloadResult>   // { status: 'cancelling' | 'cancelled' | null }
  retry(params: RetryWorkloadParams): Promise<{ id: WorkloadId }>
  get(params: GetWorkloadParams): Promise<WorkloadRowAnyKind>
  list(params: ListWorkloadsParams): Promise<readonly WorkloadRowAnyKind[]>
}
```

**`start` re-parses defense-in-depth.** Even though the tRPC layer validated, `start` re-runs the
`StartWorkloadInput` Zod discriminated union (mocked-procedure tests bypass the wire validator). It
catches the kind-active unique-index violation specifically and translates to `DomainConflictError`;
any other error rethrows. `dependsOn` is persisted but the engine does NOT enforce it — `start`/`retry`
log a clear warning at the seam so a caller isn't silently misled.

**`cancel` is race-safe and idempotent.** `markCancelling` selects the arm to TRY, but every arm's
UPDATE is status-guarded and branches on rowcount: a queued row that flipped to `running` between the
SELECT and the queued-arm UPDATE retries the running arm rather than silently dropping the cancel. The
verb does not block on the runner exiting — it returns the transition that happened; the engine aborts
asynchronously.

**`retry` clones, never mutates.** The original failure row stays as the audit trail; the clone is a
fresh `queued` row carrying the original's kind+params+dependsOn (same single-active constraint).

**`userId` is threaded but not yet an authorization input** on `cancel`/`get`/`list` — every verb is
`adminProcedure`-gated at tRPC and workloads are deployment-global today. The field is the audit
subject + the forward-compat hook for per-user workloads (F3); do not remove it (the tRPC router and
the contract both name it).

---

## Public surface (`index.ts`)

```typescript
// Service + factory
export { createWorkloadService } from './service'
export type { WorkloadService } from './contract/service'
export type { WorkloadServiceDeps } from './context'

// The cross-feature composition seam (consumed by entry/ to build the runtime value)
export type {
  WorkloadRunnerEnv, WorkloadEmbeddingsEnv, WorkloadDiscoveryEnv,
  WorkloadImportEnv, WorkloadMemoryEnv, WorkloadAssetsEnv,
  WorkloadStatsEnv, WorkloadModelsEnv,
} from './contract/runner-env'
export type { Runner } from './contract/runner'

// The kind/state/error/event vocabularies (tRPC derives its wire schemas from the tuples)
export { WORKLOAD_KINDS, type WorkloadKind } from './contract/workload-kind'
export { WORKLOAD_STATUSES, type WorkloadStatus, type WorkloadProgress } from './contract/workload-state'
export { type ParamsByKind, StartWorkloadInput } from './contract/workload-params'
export type { ResultByKind } from './contract/workload-result'
export type { WorkloadError } from './contract/workload-error'
export type { WorkloadEvent } from './contract/workload-events'

// Engine entry points (the worker DRIVER calls these — the only domain-internal symbols on the surface)
export { runWorkload } from './engine/runner'
export { reapOrphanedWorkloads } from './engine/reaper'
export { emitWorkloadEvent, getRecentWorkloadEvents, workloadStreamEmitter } from './engine/progress-bus'

/** @public — typed row + queue poll the worker driver projects (tRPC get/list responses too). */
export { loadWorkload, nextRunnableWorkload, type WorkloadRowAnyKind } from './persistence/queries'

// Verb param/result types (the tRPC router types against these)
export type { StartWorkloadParams } from './verbs/start'
export type { CancelWorkloadParams, CancelWorkloadResult } from './verbs/cancel'
export type { RetryWorkloadParams } from './verbs/retry'
export type { GetWorkloadParams } from './verbs/get'
export type { ListWorkloadsParams } from './verbs/list'
```

The engine entry points (`runWorkload`, `reapOrphanedWorkloads`, the bus trio, `nextRunnableWorkload`)
are deliberately on the front door: the `transport/jobs` worker is the only legal external caller and
must enter through `index.ts` (the `drivers-through-domain` rule). The runners are NOT exported — they
are reached only by `dispatch.ts` internally.

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `jobs/workloads-worker.ts` (poll loop, reap tick, wake-on-emit, shutdown) | **stays a driver, re-tiered** | `transport/jobs/workloads-worker.ts` | The DRIVER. Calls DOWN into the domain front door only (`nextRunnableWorkload`/`runWorkload`/`reapOrphanedWorkloads`); crosses zero feature boundaries. | resolve-time: `transport/jobs` may import only `domain/*` front doors (package + tier order); dep-cruiser `drivers-through-domain` backstop |
| `jobs/catalog-refresh-scheduler.ts` (when-to-enqueue) | **stays a driver, re-tiered** | `transport/jobs/catalog-refresh-scheduler.ts` | A recurring driver; calls `workloads.list`/`start` through the front door; swallows the single-active conflict as the desired end state. | resolve-time (same tier rule) |
| `jobs/workloads-env.ts` — `buildWorkloadsEnv` (crosses corpus/assets/import/chat/stats/models) | **→ entry**, re-partitioned | `entry/` (composition root) | It crosses EVERY feature boundary — that is an `entry/` concern, above `domain-no-cross-feature`. **NOT `transport/jobs`** (a driver must not reach sideways into features). Op providers re-map to embeddings/discovery/memory under the new domain split. | resolve-time: only `entry/` may import multiple domain front doors; a `transport/`-located cross-feature build fails the tier rule |
| `domain/workloads/engine/*` (`runWorkload`, `dispatch`, `reaper`, `progress-bus`) | **stays domain feature** | `domain/workloads/engine/` (named subsystem) | Driving one row through its state machine IS the domain's core logic. The worker decides which/when; the engine runs it. | resolve-time (same package); `feature-structure` keeps it a named subsystem |
| `engine/dispatch.ts` — `RUNNERS: { [K in WorkloadKind]: Runner<K> }` | **stays domain feature — PRESERVE VERBATIM** | `domain/workloads/engine/dispatch.ts` | The §7.5 gold standard. A missing kind is a `tsc` error here; do not change the shape. | compile-time: the mapped-type `Record` is the exhaustiveness pin; gate candidate `exhaustive-dispatch` |
| `contract/runner-env.ts` — `WorkloadRunnerEnv` + sub-interfaces | **stays domain feature, re-partitioned** | `domain/workloads/contract/runner-env.ts` | THE cross-feature seam (§8.1). Keep it; re-map `corpus`→`embeddings`+`discovery`, `chatMemory`→`memory`+`character`, `models`→`connection` per the new domain map. | resolve-time: `domain-no-cross-feature` bans runners from importing other feature internals → they MUST go through `ctx.env`; the env value is wired at `entry/` |
| `context.ts` — `createDefaultRoleClients()` fallback (reach into `_shared/role-clients-binder`) | **DELETED** | `entry/` wires the binder; runner context takes it as a required dep | `_shared` does not exist in orbweaver; role-client construction is the composition root's job (mirrors search.md). | resolve-time: `_shared` is gone; the binder is a non-optional field — omitting it fails `tsc` |
| `context.ts` — `RoleClients` import (`_shared/role-clients`) | **→ contracts** | `@orb/contracts/role-clients` | A cross-boundary type (29 importers, all type-only — §8.1); both infra and domain consume it flowing DOWN from contracts. | resolve-time: `@orb/contracts` is the declared dep for the wire type |
| `context.ts` — `loadUserSettings` (`_shared/user-settings`) | **→ settings domain (injected)** | `domain/settings` op, injected into the runner context at `entry/` | un-inverted service per dissolution §5; the runner reads the triggering user's settings via an injected op, not a `_shared` reach. | resolve-time |
| `context.ts` — `WorkloadServiceContext`/`WorkloadRunnerContext` via `ReturnType<>` | **stays domain feature, made explicit** | `domain/workloads/context.ts` — `export interface` | The inferred type is invisible at a glance; the explicit interface matches the template. | lint-time: `no-inline-types` / `types-in-contract` |
| `persistence/constraints.ts` — `isActiveKindUniqueViolation` (4-depth `cause` walk) | **split: walk → db/kit, marker → stays** | classifier `@orb/db/kit` (`isConstraintViolation`); the `workloads.kind`-marker predicate stays `domain/workloads/persistence/constraints.ts` | The 4-depth `error.cause` walk is a DB-layer concern shared with credentials' `isCredentialUniqueViolation` (dissolution §3); the kind-active marker check is domain-specific and stays. | resolve-time: `@orb/db/kit` is a declared dep; the unified walk classifier replaces the three copies |
| `engine/progress-bus.ts` — `createReplayBuffer` (`_shared/replay-buffer`) | **→ kit** | `@orb/kit/replay-buffer` | Pure, 3 feature consumers (chat/buddy/workloads) — dissolution §1 / §7.1 refines the brief's "feature-internal" to kit. | resolve-time: `@orb/kit` is a declared dep |
| `persistence/queries.ts` — `newTypeId` (`_shared/ids`) | **→ kit** | `@orb/kit/ids` | The universal mint leaf (446 importers); zero I/O, zero domain. | resolve-time |
| verbs — `DomainConflictError`/`DomainOperationError`/`DomainNotFoundError` (`_shared/errors`) | **→ kit** | `@orb/kit/errors` | Pure error base classes; `DomainNotFoundError` is boot-critical (front-door re-exports). | resolve-time |
| `WorkloadRowAnyKind` typed projection (`toView`) | **stays domain feature** | `domain/workloads/persistence/queries.ts` | The per-kind narrowing of the Drizzle `unknown` JSON columns against the discriminator; one place (not every consumer casting). Same pattern as chat's `LoadedChat`. | lint-time: `no-inline-types` (it's exported from persistence, surfaced as `@public` on the front door) |
| `db/schema/workloads.ts` + the `workloads_kind_active` partial unique index | **→ db package, unchanged** | `@orb/db/schema/workloads.ts` | The single-active-per-kind lock is the DB-level concurrency guard; the column-list marker (`workloads.kind`) the classifier keys on must stay byte-identical. | compile-time: schema move forces importers to update; the index predicate `status IN ('queued','running','cancelling')` MUST mirror `ACTIVE_WORKLOAD_STATUSES` |
| `workload-result.ts` per-kind result types (workload-OWNED, not verb re-exports) | **stays domain feature** | `domain/workloads/contract/workload-result.ts` | `domain-no-cross-feature` bars the contract from reaching into discovery/memory/etc.; the runner translates the wrapped verb's stats into THESE shapes — keeps the workload contract stable as verbs evolve. | resolve-time + lint-time |
| `tRPC` workload wire schemas (`z.enum(WORKLOAD_STATUSES)`, `StartWorkloadInput`) | **stays driver** | `transport/trpc/routers/workloads.ts` | Derives from the domain tuples so the wire can't drift from the union. Thin: validate → call `ctx.services.workloads.X` → map domain errors. | resolve-time (front-door import) |

---

## Cross-feature composition (the injection model)

`workloads` is the most cross-feature domain in the codebase — but every edge is one of two shapes:
runners reach OUT through `ctx.env` (wired at `entry/`), and other features reach IN through the front
door (the worker, the scheduler, the buddy observer, the tRPC router).

**Injected INTO the runner context (the `WorkloadRunnerEnv`, built at `entry/`):**

| Op bundle | Provided by | Consumed by runner(s) |
|---|---|---|
| `embeddings.*` (embed text / embed images) | embeddings domain (the one write path) | `embed-corpus`, `embed-assets` |
| `discovery.*` (themes, summaries, cooccurrence, duplicates, hub scores) | discovery domain (semantics) | `compute-themes`, `distill-characters`, `compute-cooccurrence`, `find-duplicates`, `csls` |
| `memory.*` (generateDigests, generateSegments) + `character.mintSyntheticGroupCharacter`/`getCard` (D28) | memory (chat subsystem) + character | `memory-backfill`, `group-character-backfill` |
| `import.*` (collect, createImportService, importCollectedProfile, app-config) | import domain | `import-st`, `assets-backfill` |
| `assets.createAssetsService` (store, backfillAvatars) | assets domain | `import-st`, `assets-backfill`, `embed-assets` (via `cas`) |
| `stats.reconcileStats` | stats domain | `reconcile-stats`, `import-st` (post-import settle) |
| `connection.refreshCatalogSnapshot` (keyless OR catalog, counts only) | connection domain (absorbs models) | `refresh-model-catalog` |
| `cas` (blob bytes) | infra/storage | `embed-assets` (image pass) |
| `roleClients` binder + `userSettings` reader | entry-wired (binder) + settings (injected) | every runner (bound per the workload's `ownerId`) |

**Reaching IN through the front door (no internals touched):**

| Consumer | Surface used | For |
|---|---|---|
| `transport/jobs/workloads-worker.ts` | `nextRunnableWorkload`, `runWorkload`, `reapOrphanedWorkloads`, `workloadStreamEmitter`, `loadWorkload` | the poll/dispatch/reap/wake driver loop |
| `transport/jobs/catalog-refresh-scheduler.ts` | `createWorkloadService` → `list` + `start` | the daily catalog-refresh decision |
| `transport/trpc/routers/workloads.ts` | `WorkloadService` verbs + `getRecentWorkloadEvents` + `workloadStreamEmitter` + the tuples | the admin UI (start/cancel/retry/get/list + SSE) |
| `domain/buddy` (observer-env, agent-env) | `workloadStreamEmitter` (event fanout) + `WorkloadService.start` | the buddy reaction observer + buddy-initiated workloads (injected at `entry/`, never sideways) |
| `embeddings` event-driven indexer | `WorkloadService.start` (injected) | enqueue `embed-corpus`/`embed-assets` on `character.updated`/`asset.created`/`digest.created`; the re-index-on-embed-model-change sweep |

No domain reaches into `domain/workloads/engine/` or `runners/` — the worker enters through the front
door; the indexer/buddy enqueue through an injected `WorkloadService`.

---

## Spine thread intersections

### §7.5 string-union dispatch discipline (workloads IS the exemplar)

`workloads.kind` is the canonical reference shape (`RUNNERS: { [K in WorkloadKind]: Runner<K> }`).
Three companion axes here follow the same discipline and must stay single-sourced: `WorkloadStatus`
(the `WORKLOAD_STATUSES` tuple — tRPC derives `z.enum(WORKLOAD_STATUSES)`, no inline re-spelling),
`WorkloadError.kind` (`runtime | cancelled | worker_died` — each arm has exactly one producing site:
runtime at the dispatcher catch, cancelled at the abort observer, worker_died at the reaper), and
`WorkloadEvent.type`. The `ACTIVE_WORKLOAD_STATUSES` tuple is the named mirror of the partial unique
index's `WHERE` predicate — the two MUST stay in sync (a status added to the lock without the tuple,
or vice versa, is a silent concurrency bug). Gate: `exhaustive-dispatch` + `no-inline-union-redecl`.

### §7.4 types & schemas — one home, one direction

- `WorkloadKind`/`WorkloadStatus`/`WorkloadError`/`WorkloadEvent`/`WorkloadProgress`/`Runner`/
  `ParamsByKind`/`ResultByKind`/`StartWorkloadInput` → `domain/workloads/contract/` (domain-internal;
  the tuples re-exported from the front door so tRPC can build wire schemas).
- `WorkloadRunnerEnv` + sub-interfaces → `domain/workloads/contract/runner-env.ts` (the seam type;
  consumed by `entry/`).
- `WorkloadRowAnyKind` → `domain/workloads/persistence/queries.ts` (the typed DB-row projection;
  `@public` on the front door for tRPC get/list + the worker).
- `RoleClients` / `Cas` → `@orb/contracts` (cross-boundary; flow DOWN into the runner-env type).
- the `workloads` Drizzle table + `$inferSelect` → `@orb/db/schema/workloads.ts`.
- `WorkloadServiceContext` / `WorkloadRunnerContext` → explicit `export interface` in `context.ts`
  (never `ReturnType<>`).

### §7.1 identity / auth / permission

Every workload verb is `adminProcedure`-gated; workloads are deployment-global today. The runner
context's "acting user" is `workloads.ownerId` (the admin who triggered, or `null` → a synthetic
`"system"` user id so the runner path is uniform). The verbs thread `userId` for audit + the F3
per-user-workloads hook, but it is NOT an authorization input yet (`cancel.ts` documents this
explicitly). When per-user workloads land, the seam is: assert `workload.ownerId === principal.userId
|| can(principal,'admin',global)` (owner∪admin via the `can()` seam — never a bare `role==='admin'`, D17) in the verb (replacing the sole reliance on the procedure gate), and
the `bindRoleClients(ownerId)` binder picks up that user's per-role credential pins automatically —
the runner code (`await ctx.roleClients.embed(…)`) does not change. Agents-as-principals (§7.1 LOCKED)
already enqueue through the injected `WorkloadService.start`, so an agent-triggered workload simply
carries the agent's `users` row id as `ownerId`.

### §7.2 settings / config

Runners resolve tunable precedence at run time (LOCKED): per-run param → the triggering user's
`UserSettings.workloads.<knob>` → the runner's floor const. Params schemas keep tunables OPTIONAL (no
Zod `.default()`); the precedence lives in the runner. Kinds with no tunables get an empty `z.object({})`
schema (kept, not omitted, so the UI renders a confirm dialog and `start()` validates uniformly).

### §8.1 coupling / the composition seam

`runner-env.ts` is "the one true cross-feature hub" — this domain is the proof that the codebase's
clean coupling (zero cross-feature deep imports) is achievable even for the most cross-cutting
feature: every edge is an injected op or a front-door call. The re-partition (corpus→embeddings+
discovery, chatMemory→memory) is the only structural churn; the *mechanism* is unchanged.

---

## Esoteric / load-bearing (must survive the migration)

1. **The single-active partial unique index** —
   `uniqueIndex("workloads_kind_active").on(kind).where(status IN ('queued','running','cancelling'))`.
   This is the DB-level concurrency guard AND the cross-replica lock: a second `start()` of an active
   kind collides at INSERT; no leader election needed — the DB resolves contention. It covers
   `cancelling` too, so a row mid-cancel still holds the slot until it terminates. The reaper is what
   frees a slot held by a dead worker's orphan. Removing `cancelling` from the predicate (or from
   `ACTIVE_WORKLOAD_STATUSES`) wedges the kind forever after a mid-cancel crash.

2. **Claim/lease/heartbeat semantics.** `markStarted` is the idempotent claim:
   `UPDATE … WHERE id=? AND status='queued'` returns 0 rows for the loser of a two-worker race → the
   loser polls the next row. `heartbeat` (5s cadence) bumps `updatedAt` for BOTH in-flight statuses;
   the reaper's stale threshold is 15s (3× cadence) so a brief GC/DB blip can't falsely reap a live
   worker. Cancel-poll cadence equals the heartbeat cadence (bounded cancel latency). These three
   constants are tuned for single-replica; they are the lease.

3. **Reaper-vs-zombie safety (the linear state machine).** `markTerminal` is status-guarded
   (`WHERE status IN ('running','cancelling')`) and returns whether it actually moved the row. If the
   reaper already flipped a stale row to `worker_died` (freeing the slot, possibly to a fresh run), a
   returning zombie runner finds the predicate no longer matches, writes NOTHING, and bails via
   `reapedDuringRun` — it cannot resurrect the row or emit a stale terminal event. The engine also
   pins `cancelling → cancelled` even when the runner returned normally after the abort fired (a
   `cancelling → succeeded` flip would violate the documented state machine). No terminal→terminal flip.

4. **The progress-bus replay buffer — `ASSUMES(single-replica)`.** The bus is a single per-process
   `EventEmitter` + a per-workload replay ring (consumes `@orb/kit/replay-buffer`). The replay closes
   the lifecycle gap where a tRPC subscription opening AFTER `start()` returns would miss the initial
   `started`/`progress` events. This is per-process: a multi-replica deploy would NOT fan events
   across replicas (the partial unique index handles claim correctness, but the bus does not handle
   cross-replica observability). Carry the `ASSUMES(single-replica)` annotation; the bus is the seam
   to replace with a shared pub/sub if multi-replica ever ships. `setMaxListeners(256)` caps
   subscription leaks. **Every event MUST carry a non-empty `workloadId`** — `emitWorkloadEvent`
   throws defensively if not (the subscription filters on it; an empty id silently drops client-side).

5. **The `WorkloadKind` Record exhaustiveness** (the §7.5 gold standard) — see its own section. A
   missing kind is a `tsc` error at `RUNNERS`, `ParamsByKind`, and `ResultByKind`.

6. **Enqueue idempotency / dedup.** The partial unique index makes a double-enqueue a conflict — the
   catalog scheduler (and any concurrent admin click / sibling replica) swallows the
   `DomainConflictError` because the conflict IS the desired end state (a row already enqueued).
   `retry` clones rather than mutating (audit-preserving). The runners themselves are idempotent
   where it matters: `import-st` skips via `importHash`, `group-character-backfill` short-circuits on
   the stored `groupCharacterId`, `embed-*` skip already-embedded rows (resumable passes).

7. **Poison-row defense (deploy skew).** `nextRunnableWorkload` windows the queue head (limit 10) so a
   handful of unrecognized-`kind` rows (a newer/older replica queued a kind this build doesn't ship)
   can't hide the next valid one; poison rows are FAILED in place via `failQueuedRow` (the queued-row
   path — `markTerminal` only transitions from in-flight states). Throwing instead would back the
   worker off and re-poll the same oldest row forever, starving the queue. `toView` mirrors this on
   the read path (a legacy/renamed kind returns `null`, filtered, never 500s `list`).

8. **`dependsOn` is PERSISTED but NOT ENFORCED.** The column + the param exist (forward-compat for a
   future DAG scheduler) but dispatch is purely `(status='queued', scheduledAt)` order. `start`/`retry`
   warn loudly at the seam so a caller supplying `dependsOn` isn't misled. Do not assume it gates.

9. **Detached root span per run.** `runWorkload` wraps dispatch in `withRequestSpan("workload:<id>", …)`
   — workloads run outside any HTTP request, so this is the only thing that makes them visible in the
   trace ring; the `workload:` requestId prefix can't collide with an HTTP request id.

10. **SIGTERM mid-run → `cancelled`.** The worker's shutdown `AbortSignal` is composed into the run's
    cancel controller, so an in-flight workload aborts cleanly on shutdown and is recorded `cancelled`
    (the operator asked the process to stop) — not left wedged for the reaper.

---

## Invariants (gate candidates)

1. **`WorkloadKind` dispatch is exhaustive** — `RUNNERS: { [K in WorkloadKind]: Runner<K> }`; a kind
   without a runner (or without a `ParamsByKind`/`ResultByKind` entry) fails the build.
   *Enforcement: compile-time (the mapped-type `Record`). Gate candidate `exhaustive-dispatch`.*

2. **Single-active-per-kind** — at most one `{queued,running,cancelling}` row per kind exists.
   *Enforcement: DB constraint (the `workloads_kind_active` partial unique index); `verbs/start.ts`
   translates the violation to `DomainConflictError`. `ACTIVE_WORKLOAD_STATUSES` MUST mirror the
   index predicate (test-time assertion the two match).*

3. **The state machine is linear (no backward / terminal→terminal transitions)** — `markTerminal` and
   `markCancelling` are status-guarded; a zombie runner whose row was reaped writes nothing.
   *Enforcement: compile-time (the guarded UPDATE returns a boolean the engine branches on) +
   test-time (reaper-vs-zombie + cancelling→succeeded-pin tests).*

4. **Runners reach cross-feature ONLY through `ctx.env`** — no `domain/workloads/*` imports another
   feature's internals; the runtime env is built at `entry/`.
   *Enforcement: resolve-time (`domain-no-cross-feature` bans the sideways import) + lint-time backstop.*

5. **`transport/jobs` calls DOWN into the domain front door only** — the worker + scheduler import
   `domain/workloads` (index), never `engine/`/`runners/`/`persistence/` directly, and never a sibling
   feature.
   *Enforcement: resolve-time (tier order + front-door rule); dep-cruiser `drivers-through-domain`.*

6. **`buildWorkloadsEnv` lives at `entry/`, not `transport/`** — the cross-every-feature construction
   is a composition-root concern.
   *Enforcement: resolve-time (only `entry/` may import multiple domain front doors; a `transport/`-located
   cross-feature build fails the tier rule).*

7. **`roleClients` (binder) is a required runner-context dep** — no `createDefaultRoleClients` fallback.
   *Enforcement: compile-time (the binder field is non-optional; omitting it fails `tsc`).*

8. **The `Runner<K>` signature lives in `contract/`** — runners depend on the contract for their type;
   `dispatch.ts` depends on the contract + each runner. No runner→engine edge (no cycle).
   *Enforcement: resolve-time (the import direction); dep-cruiser `no-cycle` backstop.*

9. **`progress-bus.ts` carries the `ASSUMES(single-replica)` marker** — the per-process EventEmitter +
   replay ring is the seam to replace if multi-replica ships.
   *Enforcement: lint-time (a `check` gate validating the annotation is present — same pattern as buddy).*

10. **Every `WorkloadEvent` carries a non-empty `workloadId`** — the subscription filters on it.
    *Enforcement: runtime (the defensive throw in `emitWorkloadEvent`) + test-time.*

---

## Resolved decisions (was: open)

- **The runner-env op partition after the embeddings/discovery split — RESOLVED (field shape locked).**
  `embeddings.*` owns the embed passes (text + image, the ONE write path); `discovery.*` owns
  themes/distill/cooccurrence/duplicates AND computes hub scores; `memory.*` owns digest/segment
  generation; `character.*` owns the group mint; `connection.*` owns the catalog snapshot. **csls /
  hub_score write-back: discovery COMPUTES, then calls `embeddings.writeHubScores` (the column owner)** —
  not a discovery-direct write to the embeddings rows (the column lives on embeddings tables; only
  `embeddings/persistence` writes it, per `db.md` + `domains/chat.md`). This is a `runner-env` interface reshape,
  not a path rename; the field map in §"The orbweaver re-partition" is the locked target. (The op
  PROVIDER details on the embeddings/discovery side are owned by those domains' docs.)
- **`embed-corpus` + `embed-assets` vs a parameterized `index` kind — RESOLVED: keep TWO distinct kinds**
  for the initial port. Preserves explicit per-source progress + per-source single-active scoping (a
  text reindex and an image reindex can run concurrently — they are different kinds). *Criterion to
  revisit (deferred):* collapse into one parameterized `index` kind ONLY if the embeddings source-kind
  registry grows past card/avatar/segment/digest AND the re-index-on-embed-model-change sweep needs
  "embed everything for the new model" as one atomic unit — at that point the single-active scope would
  move from per-kind to per-(kind,source).
- **`isActiveKindUniqueViolation` after the db-kit unification — RESOLVED.** The cause-walk classifier
  unifies to the **deeper (4-depth) walk** in `@orb/db/kit/db-errors` (shared with credentials'
  `isCredentialUniqueViolation` + the 1-level `isConstraintViolation` — the deeper walk subsumes both,
  per `db.md`). The unified classifier exposes a **"which constraint" discriminator**, so the domain's
  `workloads.kind`-marker predicate reads that discriminator instead of re-walking — and a future
  FK-on-`ownerId` violation is NOT swallowed as "already active" (the marker check guards exactly this).

### Still open (deferred, with criteria)

- **`dependsOn` enforcement — DEFERRED: keep persisted-not-enforced (warn-seam) for the initial port.**
  The column + param exist (forward-compat); dispatch is `(status='queued', scheduledAt)` order;
  `start`/`retry` warn loudly at the seam. *Criterion to wire a DAG scheduler:* when a runner genuinely
  needs ordering — then `nextRunnableWorkload` gains an "all deps terminal" predicate and the
  `WorkloadError` union re-gains a `dependency_failed` arm (currently removed as never-produced).
- **Multi-replica — DEFERRED: single-replica is the target.** Claim correctness is already
  multi-replica-safe (the partial unique index + the reaper's periodic tick handle a sibling's death,
  no leader election). The only gap is the progress bus (per-process `EventEmitter` + replay ring,
  annotated `ASSUMES(single-replica)`). *Criterion:* iff multi-replica ships — replace the
  `engine/progress-bus.ts` seam with a shared pub/sub (the annotated replacement point).
- **Per-user workloads (F3) — DEFERRED: admin-global today.** *Criterion (when non-admin triggers land):*
  wire the ownership assertion in the verbs (`ownerId === principal.userId || can(principal,'admin',global)` —
  owner∪admin via `can()`, never a bare `role==='admin'`, D17)
  replacing sole reliance on the procedure gate; `bindRoleClients(ownerId)` already picks up the user's
  per-role pins; the runner bodies are already `ctx.userId`-scoped. Confirm the cancel/get/list authz
  model (admin-sees-all vs owner-scoped) at that time.
