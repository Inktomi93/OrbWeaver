---
kind: spec
status: shipped
updated: 2026-07-03
---

# Proposed: workloads — deferred designs (per-user authz, DAG scheduler, kind collapse)

> **Status: ALL THREE BUILT.** Salvaged from the gutted `domains/workloads.md` (2026-07-03). The workloads
> domain is BUILT. All three designs this doc locked have now landed, recorded below as as-built:
> **§1 (per-user workloads / F3) LANDED 2026-07-10**, **§2 (DAG scheduler) LANDED 2026-07-11**, and
> **§3 (kind collapse → parameterized `index`) LANDED 2026-07-11** (the flexible, per-(kind, source)-lock
> form — concurrency preserved). Everything else is carried by
> the code (`domain/workloads/*` headers, `@orb/db/schema/workloads.ts`, `@orb/contracts/workloads`, the
> test suites).

## 1. Per-user workloads (F3) — BUILT (2026-07-10), as a `singular | bulk` MODE axis

Landed beyond the originally-locked "ownership assertion in the verbs": every run now carries a **mode**.
The as-built (the code is the law — `@orb/contracts/workloads` `WORKLOAD_KIND_MODES`, `verbs/start.ts`
`authorizeAndResolveOwner`):

- **`singular`** — a normal authed caller (`authedProcedure`) runs over their OWN `ownerId` (`start`
  stamps `ownerId = caller`; a request can't stamp a foreign owner). `list`/`get`/`cancel`/`retry`/
  <<<<<<< Updated upstream
  `subscribe` are IDOR-scoped to the caller's own rows (foreign id → leak-free NOT\_FOUND); admin∪owner
  \=======
  `subscribe` are IDOR-scoped to the caller's own rows (foreign id → leak-free NOT\_FOUND); admin∪owner

> > > > > > > Stashed changes
> > > > > > > get the deployment-wide view (the settled answer to the old open question — **owner-scoped for users,
> > > > > > > admin-sees-all**), role decided via the `can()` seam (D17), never a bare `role === 'admin'`.

- **`bulk`** — BOX-OWNER-only (`requireOwner`, double-gated router + verb; a `null` caller = a trusted
  system/scheduler trigger). A SWEEP-kind bulk runs across all owners (`ownerId = null`); a CREATE-kind
  bulk (`import-st`) MINTS into a required `targetOwnerId` ("import INTO user X").
- **Per-kind mode policy is the ONE home** — `WORKLOAD_KIND_MODES` (`singular`/`bulk`/`bulkRequiresTarget`
  /`stub`), tsc-exhaustive; consumers read the flags, never branch on a kind id. `stub:true` marks a
  not-yet-built runner (hidden from the run UI). Single-active lock is per-`(kind, ownerId)` for singular,
  per-`(kind)` for bulk.
- **CORRECTION to this doc's original claim** ("the runner bodies are already `ctx.userId`-scoped"):
  they were NOT — the neo-ported `embed-corpus`/`memory-backfill`/analytics runners enumerated ALL owners'
  producers (a global-corpus assumption). The rekey threaded `ownerId` into the enumeration/analytics ops
  so a singular run touches only the caller-owner's producers (and its writes; e.g. themes/duplicates
  delete-scope by owner). `csls` is ALWAYS owner-scoped (never a cross-tenant whole-space read; bulk = a
  per-owner fan-out) — the previously-unscoped hub read was deleted.
- Client: a per-user **Workloads** settings category (all authed users see their own; the owner also gets
  a "Maintenance" group for bulk-only built kinds). Agents-as-principals enqueue through the injected
  `WorkloadService.start` carrying the agent's `ownerId`, unchanged.

## 2. `dependsOn` enforcement — the DAG scheduler — BUILT (2026-07-11)

`dependsOn` is now ENFORCED at dispatch. The criterion ("when a runner genuinely needs ordering") was
met FORWARD-COMPAT: no built runner enqueues with `dependsOn` yet, but the enforcement is in place so the
column stops being a silent lie the instant a runner does — the ordering is a physics of the queue poll,
not a per-runner concern. The code is the law (`persistence/queries.ts`, `contract/workload-error.ts`).

**As-built:**

- `nextRunnableWorkload` (persistence) gates the queue poll on `resolveDependencyGate`. A queued row with
  a non-empty `dependsOn` is dispatchable ONLY when EVERY dependency reached a TERMINAL state AND each is
  `succeeded`. Terminal is defined off the status lifecycle (`TERMINAL_STATUSES` = succeeded/failed/
  <<<<<<< Updated upstream
  cancelled/worker\_died; queued/running/cancelling are active). Three verdicts:
  \=======
  cancelled/worker\_died; queued/running/cancelling are active). Three verdicts:

> > > > > > > Stashed changes

- **`waiting`** (a dep still active) → the dependent is SKIPPED, stays `queued`, un-dispatched (NOT
  failed) until its deps terminate;
- **`ready`** (all deps `succeeded`) → dispatch, unchanged order `(scheduledAt, createdAt)`;
- **`failed`** (a dep hit a NON-success terminal, or is absent) → the dependent is FAILED IN PLACE with
  the `dependency_failed` arm (queued → failed), the SAME fail-in-place discipline as a poison head row.
- **Any non-`succeeded` terminal dep is a dependency failure** (fail-fast — a single failed/absent dep
  short-circuits even if other deps are still active). The design was silent on cancelled-vs-failed deps;
  the choice is that a `cancelled`/`worker_died` dep is no more "done successfully" than a `failed` one, so
  it fails the dependent. An ABSENT dep (an id with no row) also fails the dependent — it can never become
  `succeeded`, so waiting on it would leak the row in the queue forever.
- The `WorkloadError` union re-gained the `dependency_failed` arm (`contract/workload-error.ts`), keeping
  the §7.5 one-producer-per-arm discipline: `nextRunnableWorkload` is its SOLE producer. It fails in place
  in persistence (no bus event — persistence is pure data access, mirroring the poison-row path; a
  subscriber observes the terminal via list/get).
- `verbs/start.ts` / `verbs/retry.ts` dropped their "NOT enforced" warn-seams; their headers + the
  `WorkloadRowBase.dependsOn` doc now describe the enforcement.

## 3. `embed-corpus` + `embed-assets` → one parameterized `index` kind — BUILT (2026-07-11, flexible / per-(kind, source) lock)

Collapsed into ONE `index` kind parameterized by `source`, in the FLEXIBLE form (NO concurrency loss). The
former two kinds' per-source single-active scoping is preserved by promoting `source` to a LOCKABLE
dimension — the single-active lock now keys on `(kind, source, owner)`, so a text reindex and an image
reindex STILL run concurrently, they just no longer need two separate kinds. The code is the law
(`@orb/contracts/workloads`, `@orb/db/schema/workloads.ts`, `domain/workloads/runners/index.ts`).

**As-built:**

- **Source taxonomy** (`INDEX_SOURCES`, `@orb/contracts/workloads`): `text` → the corpus/text embed pass
  (`embeddings.embedCorpus`, character cards + chat-block memory), `image` → the asset/image pass
  (`embeddings.embedAssets`, avatars), `all` → BOTH, the atomic "reindex everything for a new embed model"
  unit (folds the two passes' counts). Derived from the embeddings service's TWO bulk-sweep ops — it exposes
  exactly `embedCorpus`/`embedAssets`, not per-lens (card/segment/digest) sub-sweeps, so the source axis stops
  at text/image/all (a finer split would require plumbing into the embeddings service, out of scope — the
  collapse is at the WORKLOAD-KIND level, the service is untouched).
- **Lock mechanism** — a NON-NULL `workloads.source` column (`WORKLOAD_SOURCES` = `INDEX_SOURCES` + a `none`
  sentinel), threaded into BOTH partial-unique lock indexes: `(kind, owner_id, source)` singular +
  `(kind, source)` bulk. Every non-`index` kind carries the `none` sentinel (a shared bucket → its lock stays
  per-(kind, owner) / per-(kind) exactly as before). NOTE: a NULLABLE source would SILENTLY BREAK the lock
  for every non-index kind — SQLite treats NULLs as DISTINCT in a unique index, so two active NULL-source rows
  of one (kind, owner) would not collide; the non-null sentinel is load-bearing, not cosmetic. (A
  `coalesce(source,'')` expression index was rejected — drizzle-kit mis-generates multi-arg SQL expressions in
  `.on()`.) Pre-launch → `0000_baseline` REGENERATED (squash, not incremental).
- **Concurrency preserved (verified):** `index{source:text}` + `index{source:image}` dispatch CONCURRENTLY
  (separate lock slots), a same-source second run is single-active-blocked (`DomainConflictError`), and
  `index{source:all}` runs the atomic pass under its own slot — proven at the db lock level
  (`tests/db/schema/workloads.int.test.ts`) and the verb level (`start.int.test.ts`).
