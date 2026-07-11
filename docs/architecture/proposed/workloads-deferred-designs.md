---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed: workloads — deferred designs (per-user authz, DAG scheduler, kind collapse)

> **Status: proposed / deferred-with-criteria.** Salvaged from the gutted `domains/workloads.md`
> (2026-07-03). The workloads domain is BUILT. Of the three designs this doc locked, **§1 (per-user
> workloads / F3) LANDED 2026-07-10** — recorded below as as-built, not deferred. §2 (DAG scheduler) and
> §3 (kind collapse) remain genuinely unbuilt with their trigger criteria. Everything else is carried by
> the code (`domain/workloads/*` headers, `@orb/db/schema/workloads.ts`, `@orb/contracts/workloads`, the
> test suites).

## 1. Per-user workloads (F3) — BUILT (2026-07-10), as a `singular | bulk` MODE axis

Landed beyond the originally-locked "ownership assertion in the verbs": every run now carries a **mode**.
The as-built (the code is the law — `@orb/contracts/workloads` `WORKLOAD_KIND_MODES`, `verbs/start.ts`
`authorizeAndResolveOwner`):

- **`singular`** — a normal authed caller (`authedProcedure`) runs over their OWN `ownerId` (`start`
  stamps `ownerId = caller`; a request can't stamp a foreign owner). `list`/`get`/`cancel`/`retry`/
  `subscribe` are IDOR-scoped to the caller's own rows (foreign id → leak-free NOT_FOUND); admin∪owner
  get the deployment-wide view (the settled answer to the old open question — **owner-scoped for users,
  admin-sees-all**), role decided via the `can()` seam (D17), never a bare `role === 'admin'`.
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

## 2. `dependsOn` enforcement — the DAG scheduler

`dependsOn` is PERSISTED but NOT ENFORCED (deliberate: the column + param are forward-compat; dispatch
is purely `(status='queued', scheduledAt)` order; `start`/`retry` warn loudly at the seam — see
`verbs/start.ts`, `verbs/retry.ts`, the schema comment).

**Criterion:** when a runner genuinely needs ordering.

**The locked design:**

- `nextRunnableWorkload` (persistence) gains an "all deps terminal" predicate on the queue poll.
- The `WorkloadError` union re-gains a `dependency_failed` arm (removed as never-produced — see
  `contract/workload-error.ts`), keeping the §7.5 one-producer-per-arm discipline (the scheduler
  predicate would be its sole producer).

## 3. `embed-corpus` + `embed-assets` → one parameterized `index` kind (revisit criterion)

Two distinct kinds was the deliberate initial-port call: explicit per-source progress + per-source
single-active scoping (a text reindex and an image reindex can run concurrently — different kinds).

**Criterion to collapse into one parameterized `index` kind:** ONLY if the embeddings source-kind
registry grows past card/avatar/segment/digest AND the re-index-on-embed-model-change sweep needs
"embed everything for the new model" as one atomic unit — at that point the single-active scope moves
from per-kind to per-(kind, source).
