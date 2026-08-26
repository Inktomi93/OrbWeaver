# Issue 721 — runtime ownership, discovery bounds, and automation admission

Status: implementation design for issue #721, re-derived against
`437ccc5defc72ff4ee02f20d8500e288e56fa82b` on 2026-08-25.

## 1. Confirmed mechanisms and scope

All three assigned P1 mechanisms are live at the pinned SHA.

1. The vLLM supervisor records a detached boot as `status: "owned"`, then clears
   `spawnTriggered` as soon as health arrives (`packages/server/src/infra/providers/vllm/engine/supervisor.ts:340`).
   The next healthy decision treats an owned engine without that transient launch flag as adopted
   (`packages/server/src/infra/providers/vllm/engine/supervisor.ts:96`). The hung decision then requires both
   `status: "owned"` and `spawnTriggered` (`packages/server/src/infra/providers/vllm/engine/supervisor.ts:103`),
   so a normally booted engine loses the only state that authorizes recovery before it can become hung.
2. Character duplicate recomputation loads a whole owner/model group, builds dense hub math, asks
   `pairsAboveThreshold` for every match, and accumulates every insert before the atomic replace
   (`packages/server/src/domain/discovery/duplicates/generate.ts:66`). `pairsAboveThreshold` first allocates
   `Float32Array(n * n)` through `pairwiseCosine` and then appends an unlimited result array
   (`packages/server/src/domain/discovery/substrate/pair-cosine.ts:18`).
3. Automation dispatch reads cooldown, rule-hour, and scope-hour counters before the predicate and arms
   (`packages/server/src/domain/automation/engine/dispatch.ts:362`), while `last_fired_at` and the counted
   `outcome='fired'` row are written only after all arms finish
   (`packages/server/src/domain/automation/engine/dispatch.ts:415`). The reads themselves count only completed
   fires (`packages/server/src/domain/automation/persistence/fires.ts:65`), so concurrent dispatches can all
   pass before any one becomes visible to the others.

The character duplicate arm is the bounded-work scope. The chat duplicate implementation is an inverted
content-hash candidate index rather than this dense cosine mechanism; issue #721 does not authorize a general
rewrite of every duplicate surface. The shared `pairsAboveThreshold` correction removes its dense matrix for
image duplicates and similarity graphs too, but their separate result-policy bounds are not changed here.

## 2. Chosen architecture

### 2.1 Sticky managed vLLM ownership

`EngineState.status === "owned"` is the durable provenance classification for the lifetime of a managed
detached launch. `spawnTriggered` remains only the in-flight launch/poll flag; it must not answer ownership
after `markSpawnUp` clears it.

- A healthy `owned` engine remains owned regardless of `spawnTriggered`.
- A healthy `starting` engine becomes owned only when the in-flight flag is present; an unclaimed healthy
  port is still adopted.
- An `owned` engine reaching the third occupied probe requests recovery regardless of the in-flight flag.
- Recovery does not gain a new signal path. The queued restart still calls the #717
  `signalRecordedEngineProcess` door immediately before `SIGKILL`; PID, process-group, start-ticks,
  executable, command line, cwd, repo root, and configured listener must still match. A refusal relabels the
  state foreign and the occupied reprobe prevents spawning over it
  (`packages/server/src/infra/providers/vllm/engine/supervisor.ts:390`).

No sleep-state or OS-signal expansion is in scope. The defect is the observed healthy-to-occupied transition,
not a new provenance model for every lifecycle label.

### 2.2 Bounded character duplicate recomputation

Two explicit workload bounds apply to the expensive character recompute:

- at most **5,000 content-hash representatives per owner/model space**;
- at most **10,000 emitted character pairs across one recompute invocation**.

The representative bound reuses the repository's existing measured dense boundary
`HUBNESS_DENSE_MAX = 5000`; the output bound reuses discovery's existing derived-pair floor
`DEFAULT_MAX_PAIRS = 10_000`. They are named character-duplicate constants rather than silently sharing
unrelated knobs, because changing co-occurrence policy must not mutate duplicate admission.

The pair scan normalizes each admitted vector once (O(n * dimensions) storage), then visits only `i < j`
with scalar dot products. It never allocates an n-by-n similarity matrix. The character arm forces
`computeGroupHubs(..., { denseMax: 0 })`, whose existing streaming branch retains only one O(n) similarity
row at a time. The qualifying-pair array is capped globally; the scan throws before appending pair 10,001.
The representative check throws before normalization or comparisons when a group reaches 5,001.

Both refusals propagate before `replaceAllPairs`, preserving the last complete derived set. This is an
operator/workload capacity fault, not a caller-minted public domain error. Existing pair insert chunking and
the one-batch atomic replace remain unchanged; the batch now receives a statically bounded row set.

### 2.3 Atomic automation budget reservation

Autonomous dispatch gets a storage-only `reserved` state in `automation_fires`. It is not added to the public
`AutomationFireOutcome` union and is excluded from both fire-log list reads, so a reservation is never rendered
as a terminal. The schema's storage outcome tuple is the public terminal tuple plus this one internal member.

After the existing authority/subject gates and a true predicate, but immediately before the first arm, one
conditional `INSERT ... SELECT` attempts to create the reservation. The statement admits exactly when the
same database snapshot satisfies all four conditions:

1. no `fired` or `reserved` row for the rule lies inside `cooldown_seconds`;
2. rule `fired + reserved` count in the trailing hour is below `max_fires_per_hour`;
3. a chat-scoped rule's chat `fired + reserved` count is below its row/default ceiling; or
4. a global rule owner's chat-less `fired + reserved` count is below its row/default ceiling.

SQLite serializes the conditional insert with competing writers. There is no successful pre-read that
authorizes an effect. The existing `checkBudget` remains only as a cheap early refusal and, after a failed
conditional insert, as the detail classifier; the reservation is the authoritative admission decision.

Reservation finalization preserves current terminal accounting:

- clean autonomous completion: in one `db.batch`, update the reservation to `fired` and stamp
  `last_fired_at`/clear the error ledger;
- action error: update that reservation to `action_error`, then update the error ledger; the completed failure
  no longer consumes cooldown/hour capacity, matching today's success-only rate accounting;
- suggest-only or mid-dispatch pause: delete the reservation because those terminals intentionally write no
  fire row and consume no cooldown;
- a process/database failure that prevents finalization leaves `reserved` fail-closed. It holds capacity only
  for the same rolling-hour/configured-cooldown windows and is hidden from the terminal log. After those
  windows it is inert. Like completed fire rows, it remains stored until its rule is deleted; no fire-ledger
  retention sweep is live at this SHA.

Manual `runRuleNow` and confirmation flows retain their explicit budget bypass and do not reserve. Predicate
false/error happens before reservation and retains current logging/error semantics. A completed failed attempt
may be retried, but a second attempt cannot enter while the first is held. That is the smallest semantic delta
that closes concurrency without redefining the existing success-only budgets.

The storage-only state requires a squashed `0000_baseline.sql`/snapshot regeneration. Per
`.claude/rules/db-schema.md`, this is a merge-window change and the next server migration resets the dev DB;
the orchestrator must schedule/pin the pre-migrate backup. No regenerator will run in the shared tree.

## 3. Rejected alternatives

- **Keep `spawnTriggered` as ownership.** Rejected because its documented job is in-flight spawn exclusion and
  `markSpawnUp` necessarily clears it; making it sticky would reintroduce double-queue behavior and conflate
  provenance with activity.
- **Signal the current port PID whenever status says owned.** Rejected because a recycled/foreign listener can
  occupy the port after the original process dies. #717's launch-record verifier is the mandatory final door.
- **Chunk the n-by-n matrix.** Rejected because chunking output does not bound the matrix or the qualifying
  pair set. The scan itself must be row-streamed and both admission dimensions must be explicit.
- **Silently truncate duplicate pairs.** Rejected because replacing a complete derived set with an unexplained
  prefix looks authoritative. Capacity refusal must leave the previous complete set intact.
- **Add duplicate knobs to user settings.** Rejected as speculative policy surface. These are workload safety
  rails, not a newly requested product preference.
- **Protect automation with an in-memory mutex.** Rejected because it is process-local, does not compose across
  rule/chat/owner keys, and would make the DB fire log cease to be the source of truth.
- **Insert a provisional public `fired` row.** Rejected because a concurrent list or crash can report success
  before an arm completes, violating the domain's explicit fire-log honesty rule.
- **Create a new reservation subsystem/table.** Rejected because the existing indexed fire ledger already owns
  cooldown/hour evidence. One internal storage state plus conditional insert is the required mechanism without
  a parallel accounting plane.
- **Permanently charge failed attempts.** Rejected for this issue because D46 and the live implementation define
  these ceilings from successful fires. Changing failure economics is a separate product policy decision; the
  held reservation still prevents overlap and retry storms while work is in flight.

## 4. Coupled-site inventory

### vLLM

- `packages/server/src/infra/providers/vllm/engine/supervisor.ts`: pure decisions and state comments only.
- `tests/server/infra/providers/vllm/engine/supervisor.test.ts`: update stale pure expectations; add real-shell
  healthy-to-three-occupied-ticks recovery and identity-refusal controls.
- `process-identity.ts` and its integration test are evidence dependencies, not edit sites.

### discovery

- `packages/server/src/domain/discovery/substrate/pair-cosine.ts`: row-streaming math and optional scan bounds.
- `packages/server/src/domain/discovery/duplicates/generate.ts`: constants, representative admission, streaming
  hubs, remaining global pair budget.
- `tests/server/domain/discovery/substrate/pair-cosine.test.ts`: math parity, >vector-cap zero-work refusal,
  qualifying-pair overflow.
- `tests/server/domain/discovery/duplicates/generate.int.test.ts`: production path fails before replacement and
  preserves old rows.
- `image-analytics/retrieve.ts` and `verbs/similarity-graph.ts` retain their calls and receive only the
  no-matrix implementation; their result policy is unchanged.

### automation

- `packages/db/src/schema/automation.ts`, `packages/db/src/migrations/0000_baseline.sql`, and its snapshot:
  storage-only reservation member.
- `packages/server/src/domain/automation/persistence/fires.ts`: conditional reservation, count semantics,
  hidden-list filtering, finalize/release statements.
- `packages/server/src/domain/automation/persistence/rules.ts`: expose the stamp statement so success can batch
  it with reservation finalization.
- `packages/server/src/domain/automation/engine/budget-gate.ts`: cooldown and counts see held reservations.
- `packages/server/src/domain/automation/engine/dispatch.ts`: reserve after predicate and route every terminal.
- `tests/db/schema/automation.int.test.ts`, automation persistence tests, and
  `tests/server/domain/automation/engine/dispatch.int.test.ts`: storage/public split, conditional admission,
  held concurrency, and failure/retry semantics.
- Public contracts and client outcome rendering do not change.

## 5. Red-first and verification plan

Before production edits, plant and run these tests against the pinned implementation:

1. vLLM shell transition: a manager-triggered engine reaches owned, then returns occupied for three monitor
   ticks. A verified signal must receive one `SIGKILL` followed by exactly one detached trigger. A planted
   refused identity control must receive the attempted signal but no trigger and end foreign.
2. Discovery bounds: a 5,001-vector input must throw before any cosine work; a 143-identical-vector scan
   (10,153 possible matches) must throw at the 10,001st qualifying pair without an n-by-n allocation. An
   integration plant must show a refused recompute leaves the previous pair table untouched.
3. Automation held concurrency: defer the first real arm, launch a second event before releasing it, and
   prove only the reservation holder reaches the effect. Persistence/table-driven cases separately prove
   same-rule cooldown/rule cap, different-rule chat cap, and different-global-rule owner cap. A failure plant
   proves the held competitor is refused, then the reservation finalizes to `action_error` and a later retry
   can reserve and fire.

Focused green tier:

- the vLLM supervisor/process-identity focused tests;
- discovery pair-cosine, hub-math, duplicate-generate/retrieve focused tests;
- automation dispatch, budget/fire persistence, and DB automation-schema focused tests;
- package-scoped server/contracts/db type checks and lint for touched files if repository scripts expose them.

No `verify --full`, structure/check-gates, hook, or whole-tree battery runs in this lane. The orchestrator owns
merge checks. Literal sweeps cover `reserved`, the duplicate bounds, and every changed outcome/count predicate.

## 6. Prior-art constraint used

`rollout_summaries/2026-08-14T02-54-19-7G8r-orbweaver_orchestration_hooks_qwen_vllm_and_agent_cleanup.md`
records the ownership-inversion lesson: preserve the Agent SDK/current vLLM backend and remove only obsolete
skins. Applied here, that means repairing the supervisor's existing detached-launch provenance and reusing
#717's identity door rather than reviving child-process ownership or inventing a second launch path.

## 7. Implementation and proof receipts

Implemented as three stacked code legs after the design commit. No scope fork remained: the chat
inverted-index duplicate arm was excluded, and no signal path beyond #717's launch-identity verifier changed.

Red-first receipts on the pinned implementation:

- vLLM supervisor: 4 failed / 38 passed. The pure ownership/hung expectations failed, and both real-shell
  healthy-to-occupied controls observed zero `SIGKILL` attempts.
- discovery pair scan: 2 failed / 3 passed because vector/output bounds were ignored; the production
  143-representative integration plant resolved with 10,153 rows instead of refusing.
- automation held concurrency: 2 failed / 19 skipped. Both the success and failure plants observed two arm
  entries while the first effect was still held.

Final focused behavioral receipts:

- vLLM supervisor + process identity: 2 files, 51 tests passed.
- discovery pair/hub/character duplicates/retrieve/image analytics/similarity graph: 6 files, 39 tests passed.
- automation dispatch/handle-event/fire-budget-rule persistence/fire views/schema/contracts: 9 files,
  83 tests passed.
- additional atomic persistence rerun after converting rule/chat/owner cases to simultaneous reservation
  attempts and planting the missing-reservation/no-stamp control: 1 file, 6 tests passed.

Static receipts: `@orb/server`, `@orb/db`, and `@orb/kit` package TypeScript programs passed; a focused Biome
check over all 14 touched TypeScript files passed. The lane deliberately did not run full verification,
structure/check-gates, hooks, or a whole-tree test battery.

The squashed baseline regenerated in the isolated worktree. Its SQL delta is exactly the addition of
`'reserved'` to `automation_fires_outcome_check`; the snapshot carries the same constraint delta plus the
generator-issued snapshot id, and the journal carries only the regenerated baseline timestamp. Per the DB
rule, merging this changes the baseline hash and the next server migration resets the dev database, so the
pre-migrate backup must be pinned in the orchestrator's merge window.

## 8. Post-#720 union-baseline integration

The completed #721 stack was merged with post-#720 main `41d198f1d5f1`. The independently generated SQL,
snapshot, and journal were discarded rather than text-merged, then one `0000_baseline` was regenerated from
the union source schema. The regenerated baseline reports 91 tables and contains all of:

- #720 `chat_import_claims`, including the `(character_id, import_hash)` scope primary key and chat index;
- #720 `chat_handoff_resumptions`, including its accepted-user index and chat/user foreign keys;
- #721's storage-only `reserved` member in `automation_fires_outcome_check`.

The direct schema-to-baseline comparator plus boot/client migration tests passed: 3 files, 37 tests. That run
applied the fresh baseline, proved current/idempotent boot, exercised regenerated-baseline auto-reset,
verified backup-before-reset and retention, and proved launched mode refuses the destructive reset. The #721
focused reruns passed vLLM ownership (2 files, 51 tests), bounded discovery (6 files, 39 tests), and atomic
automation admission (9 files, 84 tests). The `@orb/server`, `@orb/db`, and `@orb/kit` TypeScript programs and
focused Biome check over the 14 #721 TypeScript files also passed. No whole-tree verification,
structure/check-gates, hooks, or full suite ran in the lane.

This union regeneration changes the baseline journal timestamp/hash again. The merge-window consequence is
unchanged: a normal development boot takes a backup, resets the stale squashed-baseline database, and applies
the union baseline; launched mode fails instead of wiping. The orchestrator must preserve that reset/backup
window when integrating this stack.
