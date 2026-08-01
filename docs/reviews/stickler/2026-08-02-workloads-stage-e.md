# Stickler review — D117 stage E (workloads two-lane worker · durable progress · poison surface · stats.reconcile)

- **Range reviewed:** `a541ae8f..8b284802` (the merge at HEAD; branch commit `bea2851c`). 43 files.
  NOTE: `git diff a541ae8f..bea2851c` shows ~136 files (branch forked from older main) — the correct
  review surface is what the MERGE introduced; all sweeps below use `a541ae8f..8b284802`.
- **Spec of record:** `docs/reviews/stickler/2026-07-25-workloads-junk-drawer-exit.md` §3.3 + §5-E;
  ledger D117 clauses (9)–(12) amendment (`docs/architecture/core/Core-Path-Registry.md`).
- **Verdict:** two findings (1 medium pre-existing at the seam, 1 low doc-law drift), one
  severity-assessed accepted risk. The stage-E work itself is solid: every D117 (9)–(12) claim checks
  out against the code, the gate battery is green, and all touched test files pass in this session.

---

## Findings

### F1 — MEDIUM (pre-existing, at the seam of touched code): `scheduledAt` is never enforced at dispatch — a "Run at" (deferred) row runs immediately

- **Where:** `packages/server/src/domain/workloads/persistence/queries.ts:296-302` —
  `nextRunnableWorkload`'s head query is
  `WHERE status = 'queued' AND lane = ?` ordered by `(scheduledAt, createdAt)`. There is **no
  `scheduledAt <= now` predicate anywhere in the dispatch chain** — the `now` parameter is used only
  to stamp `failQueuedRow`. Neither `claimAndRunNext` (workloads-worker.ts:103-145) nor `runWorkload`
  (engine/runner.ts:196) checks the row's `scheduledAt`.
- **Failure scenario:** user opens the Run dialog, sets "Run at" = tomorrow 03:00, submits. The
  client wires it end-to-end (`run-workload-dialog.tsx:103-108` → `transport/trpc/routers/workloads.ts:51,67`
  → `verbs/start.ts:63` persists the future `scheduledAt`). The row is `queued`; its lane's poll loop
  fires within `pollIntervalMs` (2 s); the head query returns it (no time gate); `markStarted` claims
  it; **the job runs now**. The client's "Scheduled" badge (`isDeferredWorkload`,
  `workloads-run-model.ts:23-24`) renders for an instant and flips to Running.
- **Evidence produced this session:**
  - Code: the WHERE clause above, read in full; `/usr/bin/grep -rn scheduledAt` over
    `domain/workloads/` shows no other dispatch-side use.
  - The repo's own green test demonstrates the behavior live: the NEW stage-E lane test
    (`tests/server/domain/workloads/persistence/queries.int.test.ts:229-242`) seeds
    `interactive_row` with `scheduledAt: T0 + 1000` and asserts
    `nextRunnableWorkload(db, C, T0, "interactive")` **returns it** — i.e. a future-dated row is
    dispatched at `now = T0`. Ran green in this session (115/115).
  - History: `git log -L` over `nextRunnableWorkload` — the time gate has **never existed**
    (Phase 4c `aab6c7f2` onward). Pre-existing, NOT introduced by stage E.
- **Why it lands in this review anyway:** stage E rewrote this function's contract comment, added the
  lane predicate, and minted a regression test that now **enshrines the wrong semantics** (a future
  row asserted dispatchable); the same merge's CT
  (`workloads-settings-surface.ct.tsx:580-602, 628-649`) asserts the client deferral affordance
  ("start carries scheduledAt", "Scheduled" state) — the client promises a deferral the engine does
  not honor. D117 §6 Q6 explicitly ruled `scheduledAt` a kept, live consumer surface.
- **Cost:** the deferral feature is a silent no-op — a user-visible correctness break (a deferred
  bulk import meant for off-hours runs immediately), not data loss.
- **Remediation direction (orchestrator routes; not fixed here):** add `scheduledAt <= now` (or
  `lte(workloads.scheduledAt, now)`) to the head query; fix the lane test's fixture (its intent was
  lane scoping — give the interactive row a past `scheduledAt`); add the missing regression ("a
  future-dated row is NOT dispatched before its instant").

### F2 — LOW (doc-law drift): the worker header claims enqueue wakes the lanes — nothing emits on enqueue

- **Where:** `packages/server/src/transport/jobs/workloads-worker.ts:19-20` — "wake-on-emit (an
  enqueued row short-circuits every lane's poll wait)".
- **Evidence:** `ast-grep run -p 'emitWorkloadEvent($$$A)' -l ts packages/server/src
  --files-with-matches` → exactly `engine/runner.ts` + `engine/reaper.ts`. Neither `start` nor
  `retry` nor `schedule-tick` nor the tRPC router emits anything at enqueue. The wake bus
  (`subscribeWorkloadWake`, progress-bus.ts:37-42) fires only on started/progress/terminal events of
  already-dispatched rows.
- **Consequence:** behaviorally minor — a fresh enqueue on an idle queue waits up to
  `pollIntervalMs` (2 s), which the poll cadence covers by design. But in this repo **file headers
  are per-domain law** (constitution: "the code + its file headers ARE the doc"), and this header
  asserts a mechanism that does not exist (phrase carried verbatim from the pre-lane header,
  `git show a541ae8f:...workloads-worker.ts:19`). An agent reading the header as law would build on a
  false invariant (e.g. assume sub-poll enqueue latency).
- **Remediation direction:** correct the header (the wake covers back-to-back items via terminal
  events, not enqueue), or emit a wake at the enqueue door if sub-poll latency is actually wanted.

---

## Severity-assessed, no action mandated

### A1 — LOW: `stats.reconcile` has no throttle / single-active guard (flagged in the dispatch brief; assessed honestly)

- **Where:** `packages/server/src/transport/trpc/routers/stats.ts:60` (bare `authedProcedure.mutation`);
  `domain/stats/verbs/reconcile.ts` → `substrate/reconcile-owner.ts` → `write/rebuild-from-canon.ts`.
- **What spam-clicking actually costs:** each call is a full keyset-paged scan of the CALLER's own
  canon (messages + swipes, CHUNK 5000) + one atomic replace. Concurrent same-owner runs are
  **last-write-wins and never torn**: the per-owner replace is ONE `db.batch`
  (rebuild-from-canon.ts:721-739 — delete ×4 + inserts in a single transaction), so no duplicated or
  half-rebuilt rollups are possible. Scope is `principal.userId` by construction (no id input) — a
  caller can only burn cycles on its own data. The client button is disabled while pending
  (analytics-overview-surface.tsx:141). Residual exposure: an authed user hammering the endpoint
  directly = self-inflicted DB load on a self-hosted box; and a reconcile racing live chat deltas can
  clobber a delta applied between scan and batch-write (bounded to that window, identical exposure on
  the `reconcile-stats` workload arm, self-heals on the next delta/reconcile).
- **Verdict:** acceptable as shipped for this deployment shape. Cheap hardening if ever wanted: an
  in-process per-owner in-flight latch (coalesce concurrent calls), not a queue round-trip.

---

## Verified clean (what my silence covers, and how)

**Gates:** whole-tree `pnpm check` run by me on the merged tree — **PASS, all 12 stages**
(lint:biome · lint:eslint · types:packages/graph/testd/tests-dom/tests-membership ·
tests:execution-membership · structure:full · imports:depcruise · deps:knip · docs:format), full
output read (47 lines; `reports/verify.json`).

**Tests run green this session:** 115 (queries.int, runner.int, retry.int, start.int,
workloads-worker unit, db schema workloads.int, axes.contract, stats reconcile.int) + 21 (all
touched stats-verb clock-injection files, constraints.int, portability-routes suite, bundle
round-trip suite) + cross-tenant sweep (2) + **26 CT** (workloads-settings-surface,
analytics-overview-surface).

1. **Two-lane claim/lease/reap under concurrency**
   - Cross-lane double-claim impossible: a row has ONE `lane` value and each loop's head query is
     lane-scoped (`queries.ts:300`).
   - Same-lane N>1 (future `laneConcurrency` widening): `markStarted` is the status-guarded
     idempotent claim (`queries.ts:157-164`); the loser bails before dispatch
     (`runner.ts:197-200`) — pinned by runner.int "claim loser returns silently".
   - Lane independence is regression-pinned exactly as the ledger claims: sweep lane occupied BY
     CONSTRUCTION (never-settling run), interactive claims + completes
     (`workloads-worker.test.ts:147-179`) — green.
   - Reaper: ONE shared boot + periodic reap, lane-agnostic **by design** (reap is lease
     bookkeeping, not execution); `worker_died` goes through status-guarded `markTerminal` — a
     returning zombie writes nothing (pinned: runner.int zombie guard). Stage E **improved** the
     reaper: params-poison in-flight rows now reap (toView returns the non-null poison arm into
     `findStaleInFlight`). Remaining non-issue: an UNKNOWN-KIND in-flight row (deploy-skew only)
     is filtered by `toView === null` and stays unreaped while skewed — it holds no lock any known
     kind contends on (locks are per-kind) and reaps at first boot after re-upgrade. No consequence;
     not a finding.
   - Starvation: within-lane `QUEUE_HEAD_WINDOW = 10` semantics unchanged (pre-existing); poison
     heads are failed-in-place so they cannot wedge a lane.
2. **DB baseline squash (the gate-blind spot)**
   - `packages/db/src/migrations/` contains ONLY `0000_baseline.sql` + meta (ls). The migration diff
     is EXACTLY `+lane` (TEXT DEFAULT 'sweep' NOT NULL) + `+progress` (TEXT) +
     `workloads_lane_check CHECK(lane in ('interactive','sweep'))`; `0000_snapshot.json` regenerated
     (new id, same prevId) with the same three additions; `_journal.json` `when` bumped. No `0001`.
   - The CHECK derives from the tuple (D34): `LANE_CHECK_LIST = WORKLOAD_LANES.map(...)`
     (`schema/workloads.ts:71,149`) — never re-spelled. Mirrors pinned + run green: column enum ===
     tuple, CHECK refuses `'express'`, default is `sweep`, progress JSON round-trips
     (`tests/db/schema/workloads.int.test.ts:41-70`). Golden tuple pins live in
     `tests/contracts/workloads/axes.contract.test.ts:144-164` (lanes + resume policies + Record
     exhaustiveness backstops) — green. Default lane `sweep` is the conservative floor (a writer
     that forgot the stamp can't squat the interactive lane).
3. **Poison arm — no path into dispatch**
   - The dispatch type is `WorkloadRunnableRow` (poison arm excluded **by type**,
     `contract/workload-row.ts:57`); `nextRunnableWorkload` fails a poison/unknown head in place
     and continues (`queries.ts:303-310`). Schedule-tick cannot enqueue poison: it goes through the
     `start` verb which re-parses via `parseWorkloadInput` (`substrate/params.ts`). `retry` of a
     poison row clones the RAW blob (`loadRawWorkloadParams`) — pinned green (retry.int "raw params
     blob survives the clone"); the clone locks under `NON_INDEX_SOURCE` (deliberate, documented in
     the verb header) and, if still unparseable in this build, is refused at the head and surfaces
     as a visible failed row. The read surface applies the identical SQL owner filter to poison and
     healthy rows (`listWorkloads` → `resolveListOwnerFilter`) — no cross-tenant poison leak.
     Only an unknown KIND drops from reads (deploy skew — cannot be spelled), exactly as D117 (11)
     states.
4. **Heartbeat piggyback — no lost-progress or resurrect path; extra-write bounded**
   - ONE write path: `heartbeat(db, id, now, progress?)` carries the snapshot in the SAME UPDATE,
     guarded on `IN_FLIGHT_STATUSES` — a late lease write on a terminal row writes nothing (pinned
     green: "progress cannot resurrect it"). Progress survives the terminal stamp (`markTerminal`
     does not touch the column; pinned green).
   - Throttle: `report()` writes at most once per cadence; the timer tick writes unconditionally
     AND advances `lastWriteAt`, so steady-state is ~1 write/cadence with a worst case of one extra
     write on phase alignment — the ledger's "chatty run costs the same as a silent one" holds to
     within +1 write/cadence. Pinned green (runner.int throttle test, injected clock).
   - Lost-progress: the final `report()` inside the last cadence window may not persist — durable
     staleness bounded to ≤ one cadence, and the client never renders progress on terminal rows
     (`WorkloadProgressLine` gates on `processing`). Non-issue.
   - The `void heartbeat(...)` fire-and-forget inside the lease writer is PRE-EXISTING (old code
     void'd the same call per report, unthrottled — stage E strictly reduced this surface).
5. **stats.reconcile authz + wiring**
   - No id input; the router passes `ctx.auth.userId` (`stats.ts:60`); the verb path
     (`verbs/reconcile.ts` → `substrate/reconcile-owner.ts`) ALWAYS passes `ownerId` — the bulk
     all-owners arm is structurally unreachable from the mutation. Owner isolation pinned green
     (reconcile.int "touches NO other owner's rollups" — asserts the `owner_stats` table contains
     only the caller's row). Sweep classification present with reason
     (`cross-tenant-sweep.suite.int.test.ts:974-976`, suite green — every proc classified).
   - `StatsContext` clock injection threaded at compose (`search-discovery.ts:212`,
     `createStatsService(db, now)`); all 14 stats verb test files updated mechanically and run
     green; discovery harness updated (`tests/server/domain/discovery/_support.ts`).
   - The substrate seam (`reconcile-owner.ts`) matches the house verb→subsystem pattern (the
     chat/backfill precedent) and passed `structure:full` + depcruise.
6. **Wake waiter Set — no correctness-bearing lost-wake**
   - The classic lost-wake window exists (an event firing between a null poll result and
     `waiters.add(finish)`) but the poll cadence is the designed backstop: worst case one extra
     `pollIntervalMs` (2 s) of latency, no lost work. `finish()` is idempotent (`settled`),
     self-removing from the Set, cancels its timer, and removes its abort listener; the wake
     listener iterates a snapshot (`[...waiters]`).
   - Abort-safety: the listener is registered synchronously inside the promise executor before any
     await, and an abort cannot interleave with the sync window between the loop's `aborted` check
     and `sleep()` (single-threaded JS) — no hang on an already-aborted signal.
   - Entry wires `scheduleTimeout` as a `setInterval` factory (`lifecycle.ts:237-241,256-257`) — a
     wart, not a bug: `finish()` always clears the timer on its first fire, so it cannot re-fire.
   - Observation (negligible): every progress event from a running row wakes the OTHER lane's
     sleeping loop → one head SELECT per event. At realistic report cadences this is noise; a
     lane/event-type filter on the wake is available if it ever matters.
7. **Client (rendered, not just source)** — asserted at the DOM by the two new CT files, green this
   session: lane group headings for two-lane data + heading DROPPED for single-lane data
   (`workloads-settings-surface.ct.tsx:653-686`); durable progress rendered off the LIST read with
   an empty SSE tail (`aria-valuenow="72"`, :690-703); poison row visible + `Unreadable` badge +
   plain copy + Retry fires (:706-722); Recompute button fires `stats.reconcile` and the settle
   re-reads freshness (`analytics-overview-surface.ct.tsx:40-58`). Live-tail-wins fallback verified
   at the code seam (`workload-row.tsx:157`, `live ?? durable ?? indeterminate`).
8. **Ledger conformance (D117 (9)–(12), each claim vs code)** — (9) lane is a COLUMN stamped at
   `start` (start.ts:59) and RE-stamped by `retry` from the kind's CURRENT contribution
   (retry.ts:60; pinned green by retry.int "re-stamps the clone's lane"); one poll loop per lane ×
   `laneConcurrency` default 1; shared reap + ONE wake subscription; every single-active index
   untouched (baseline diff shows no index change). (10) verified in §4 above. (11) verified in §3
   above. (12) verified in §7 above. RESIDUALS: no `subscribeWorkloadEvents` export anywhere
   (front door exports `subscribeWorkloadWake` — index.ts:31). The registry amendment diff touches
   ONLY the D117 clause line. Lane declarations swept across all 8 factories + reserved:
   `databank-ingest` is the sole `interactive`, matching D117.
9. **Test-reality check** — the load-bearing new branches each have a test that fails if the branch
   is wrong: lane scoping (query-level + worker-level + verb-level stamp/re-stamp), poison
   visible/retryable/refused (persistence + verb + CT), progress durable/throttled/guarded
   (engine + db + CT), reconcile scope (verb-level with a second seeded owner). The worker unit
   tests fake at the edges but the same seams are re-proven against a real DB in queries.int /
   runner.int, and the entry suites drive a REAL `import-bundle` workload through the runnable-row
   path. No assertion-free or tautological tests found in the diff.

## Regions NOT read (scope boundary)

- `packages/client/src/features/workloads/hooks/use-workload-stream.ts` (untouched; behavior
  inferred from its call site + CT coverage).
- The run bodies inside `domain/*/workload-contributions.ts` (untouched at stage E; only their
  `lane:` declarations swept).
- Stats read-verb internals other than the reconcile path (untouched beyond ctx threading;
  typecheck + their int tests green).
- `entry/compose/workload-contributions.ts` (untouched at stage E).

## Unconfirmed suspicions

- None. (The unknown-kind-reap gap, the lost-wake window, and the wake-per-progress-event churn are
  CONFIRMED behaviors assessed as no-consequence and recorded under "verified clean" — not dressed
  as findings.)

## Durable lesson for the orchestrator

`scheduledAt` deferral has NEVER been enforced at dispatch (Phase 4c onward) while the client ships
a full "Run at" affordance — any fix to `nextRunnableWorkload` must add the time predicate AND
repair the stage-E lane test whose fixture (future-dated row asserted dispatchable) now enshrines
the wrong semantics.
