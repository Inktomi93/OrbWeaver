# Proposed: workloads — deferred designs (per-user authz, DAG scheduler, kind collapse)

> **Status: proposed / deferred-with-criteria.** Salvaged from the gutted `domains/workloads.md`
> (2026-07-03). The workloads domain is BUILT; these are the three genuinely-unbuilt designs that were
> locked with explicit trigger criteria. Everything else the old doc described is carried by the code
> (`domain/workloads/*` headers, `@orb/db/schema/workloads.ts`, `@orb/contracts/workloads`, the test
> suites).

## 1. Per-user workloads (F3) — the verb-level ownership assertion

Today every workload verb is `adminProcedure`-gated at tRPC and workloads are deployment-global.
`ownerId`/`userId` is threaded through the verbs and the runner context as the **audit subject only**
— it is NOT an authorization input (`contract/params.ts` + `contract/service.ts` say so). Do not
remove the field; it is the forward-compat hook.

**Criterion:** when non-admin workload triggers land.

**The locked design:**

- Wire the ownership assertion **in the verbs** (replacing sole reliance on the procedure gate):
  `workload.ownerId === principal.userId || can(principal, 'admin', global)` — owner∪admin via the
  `can()` seam, never a bare `role === 'admin'` check (D17).
- `bindRoleClients(ownerId)` already resolves the owning user's per-role credential/model pins, so the
  runner bodies do not change (`await ctx.roleClients.<role>(…)` is already owner-scoped), and the
  runner bodies are already `ctx.userId`-scoped.
- Agents-as-principals already enqueue through the injected `WorkloadService.start`, so an
  agent-triggered workload simply carries the agent's `users` row id as `ownerId`.

**Open question to settle at build time:** the `cancel`/`get`/`list` authz model — admin-sees-all vs
owner-scoped listing.

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
