# 1049 Phase 1: caught-failure-ownership owner recognition

Lanes cb-1049-owners (predecessor) and cb-1049-owners-2, branch `wt/agent-a4bd93033f54dc368`, base `724c65684d`.
Phase 1 lands the reader change and the waivers its scoped runs proved retired. Phases 2 and 3 follow.

## Reader change

Files: `tooling/src/verify/lib/caught-failure.ts`, `caught-failure-scope.ts`, `caught-failure-outcome.ts`, plus proof rows in
`tooling/src/verify/gates/caught-failure-ownership.ts` (67b039c944 added 6 mustFlag and 3 mustPass rows, for 71 / 33; the refutation fix below adds 4 mustFlag and 1 mustPass, for 75 / 34).

- **errorToast mutation, across modules.** A `createEntityMutation` hook imported from another module (also through a
  re-export) keeps its `errorToast` owner. The declaration must be a `const`, because the write guard reads only the
  importing file (`caught-failure-scope.ts`, the foreign-declaration fence).
- **Sole-operation try.** A try block whose only statement is a governed framework operation is not a site, whatever its
  catch returns. `catchClauseSite` now checks the framework owner before the default arm.
- **Guarded rethrow.** `if (!isConflict(err)) { throw err; }`: the guard reads the caught binding, or a `const` derived
  from it in the same block, and the branch ends by rethrowing that binding (or chaining it as `cause`) with nothing
  able to leave first (`guardedRethrow`, `branchRethrows`, `guardReadsBinding`).
- **Typed refusal.** `callIsFailureOutcome` no longer needs the caught binding: a call whose type admits only failure
  discriminants, or whose single-return factory body is a failure outcome, owns. A conditional `return <refusal>` is not
  an escape (`escapesOnlyByRefusal`, `controlFlowVerdict`), and it keeps the rethrow credit an escape would earn.

### Declared limits (8, each with a proof row; gate header)

1. A dynamically keyed rejection link is unreadable, not assumed (`dynamic-rejection-key` mustPass).
2. zod's `.catch()` is schema construction (`zod-catch` mustPass).
3. Build/config files outside `packages/<name>/src`, `tests/` and `scripts/` are outside the population (population-fence mustPass).
4. A rethrow or owner behind an opaque helper is invisible (`opaque-rethrow-helper` mustFlag).
5. A mutation owner behind a wrapper hook's returned function, an injected save or a local wrapper is not expanded, and a
   try doing more than the governed operation is not a sole-operation owner (indirect-mutation-owners mustFlag).
6. A function-valued `errorToast` may return null and is not expanded (function-toast mustFlag).
7. A multi-statement helper typed `{ ok: false }` is not a typed refusal, because the read takes `ok` through
   `literalValue`, which is undefined for a boolean (boolean-typed-refusal mustFlag). See the
   boolean follow-up below: the cause is the read route, not missing data.
8. A guarded rethrow's guard must read the caught binding; how narrow it is stays unjudged (guarded-rethrow mustPass
   beside the fooled-guarded-rethrow mustFlag).

## Proof rows

Runner: `pnpm exec node <scratch copy of reports/cb-1049-mine/cb-1049-conformance.ts> <worktree>` (calls
`verifyPolicyProofs([gate])`).

- Red-first v1 (predecessor, HEAD reader, before the 71st mustFlag row): 70 mustFlag / 33 mustPass / 4 failures.
- Red-first v2 (this lane, HEAD reader, all rows): 71 / 33 / 4 failures, the same four rows.
- New reader at 67b039c944: 71 / 33 / 0 failures. After the refutation fix: 75 / 34 / 0 (`reports/cb-1049-mine/cb-1049-3-conformance-post.log`).

### Red-first v1 log (predecessor)

```text
caught-failure-ownership: 70 mustFlag · 33 mustPass · 4 failure(s) · 17759ms
  x mustFlag[62] · the module hop keeps every provenance check: a local or imported lookalike hook, an empty, undefined or success errorToa
      expected effective finding count=7 but got 6
  x mustPass[17] · an entity-mutation hook IMPORTED from another module, through a re-export, keeps the errorToast owner: the binding resol
      expected zero effective findings but got 1: UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch whose only escape is a constant fallback — the behaviour changed and nobody was told.
  x mustPass[18] · THE GUARDED RETHROW, the mirror of the discriminated rethrow: a guard that classifies the caught binding (directly, or t
      expected zero effective findings but got 5: UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.
  x mustPass[19] · THE TYPED REFUSAL: a call whose declared type admits only the failure member, or a single-return factory whose body is t
      expected zero effective findings but got 4: UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a promise rejection handler that discards the failure.
```

### Red-first v2 log

```text
caught-failure-ownership: 71 mustFlag · 33 mustPass · 4 failure(s) · 27564ms
  x mustFlag[62] · the module hop keeps every provenance check: a local or imported lookalike hook, an empty, undefined or success errorToa
      expected effective finding count=7 but got 6
  x mustPass[17] · an entity-mutation hook IMPORTED from another module, through a re-export, keeps the errorToast owner: the binding resol
      expected zero effective findings but got 1: UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch whose only escape is a constant fallback — the behaviour changed and nobody was told.
  x mustPass[18] · THE GUARDED RETHROW, the mirror of the discriminated rethrow: a guard that classifies the caught binding (directly, or t
      expected zero effective findings but got 5: UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.
  x mustPass[19] · THE TYPED REFUSAL: a call whose declared type admits only the failure member, or a single-return factory whose body is t
      expected zero effective findings but got 4: UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a catch block (and its finally) that names no owner at all.; UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md) THIS SITE: a promise rejection handler that discards the failure.
```

## Retirements (7)

Proof: the new reader's scoped run raised a stale-waiver alarm ("no live caught-failure-ownership finding is bound to its
comment carrier") on a marker whose site the census record listed as `deliberate-absorb`, which means HEAD reported a
finding there (Plan B, note 1726). Each site's HEAD arm was read in memory with the HEAD reader over the HEAD file text
(scratch `cb-1049-2-arms.ts`): all seven are `empty`. Marker line numbers are the pre-deletion lines.

| Owner kind | Marker (HEAD line) | Census row removed |
| - | - | - |
| guarded rethrow | packages/server/src/domain/credentials/verbs/add.ts:31 | `…/add.ts::insertInFreeSlot::err::1` |
| guarded rethrow | packages/server/src/domain/character/seeder/seed.ts:70 | `…/seed.ts::createDefaultCharacterSeeder.seedCard::err::1` |
| guarded rethrow (via a `const` derived from the binding) | packages/server/src/transport/trpc/subscriptions.ts:31 | `…/subscriptions.ts::withSubscriptionErrors::err::1` |
| guarded rethrow | tooling/src/floor/process/process-priority.ts:45 | `…/process-priority.ts::lowerChildPriority::error::1` |
| guarded rethrow | tooling/src/snap/lib/heap-devtools.ts:220 | `…/heap-devtools.ts::parsedSnapshot::error::1` |
| typed refusal | packages/server/src/primitives/serde/lib/index.ts:120 | `…/serde/lib/index.ts::decodeObject::catch::1` |
| typed refusal | packages/server/src/primitives/serde/lib/index.ts:129 | `…/serde/lib/index.ts::decodeObject::catch::2` |

By kind: guarded rethrow 5, typed refusal 2, errorToast mutation 0, sole-operation default 0. No errorToast or
sole-operation candidate reached a verdict (all 31 client candidates are in the no-verdict list).

Population record (`caught-failure-ownership.population.json`): hand-edited, exact. The rows are keyed
`path::scope::token::ordinal` with no line, so removing these seven rows is exact. Totals: sites 695 to 688,
`deliberate-absorb` 693 to 686, `empty` 354 to 347; `reported` stays 2. The generator was not run.

## Runs

`pnpm check:structure --check caught-failure-ownership --file …`, one setsid session per run, 900 s killpg stop, orphan sweep
after each (reparented semantic-inventory workers with cwd in this worktree only). Peak is the run's process tree RSS.

| Run | Reader | Files | Wall | Peak | Verdict |
| - | - | - | - | - | - |
| #0b census | HEAD | 2 | 216 s | 4.4 GB (largest process) | 2 effective, 1 dead-position alarm |
| #0-kit | HEAD | 9 | 900 s | not captured | stopped, no verdict |
| #0-kit-1 (kit/src/time/index.ts) | HEAD | 1 | 127.5 s | CLI 3.1 GB, worker 0.47 GB | 6 waived, 0 effective. One world: packages/kit/tsconfig.json. Evaluate 91.4 s, worker 11 s |
| controller.ts, try 1 | HEAD | 1 | 164 s | CLI 3.0 GB | no verdict: "native inventory worker implementation changed during staging" (marker deletions landed mid-run) |
| controller.ts, try 2 | HEAD | 1 | 739 s | CLI 4.3 GB, worker 2.0 GB | 2 effective (:53 `run`, :54 `operation.promise`), 2 waived |

Post-change attempt 1 (archived in `reports/cb-1049-mine/runs/attempt1/`, 5 client batches in parallel). Invalid as a
set: the first sweep treated live sibling workers as orphans and killed pids 161248 and 166111 (both with cwd in this
worktree), which voided client-3 and client-5. client-4 was a real heap abort of the client inventory worker at the
16 GB cap (SIGABRT, 19 GB tree peak). The census batch is the one kept verdict: identical to pre-change.

| Run | Files | Exit | State | Wall s | Peak GB |
| - | - | - | - | - | - |
| attempt1 packages-client-4 | 5 | 2 | done | 522.2 | 19.4 |
| attempt1 census | 2 | 1 | done | 635.7 | 4.1 |
| attempt1 packages-client-3 | 5 | 2 | done | 642.9 | 8.5 |
| attempt1 packages-client-1 | 5 | -15 | stopped | 902.4 | 2.7 |
| attempt1 packages-client-2 | 5 | -15 | stopped | 904.4 | 2.8 |
| attempt1 packages-client-5 | 5 | 2 | done | 382.2 | 18.1 |

Post-change attempt 2 (non-client, 5 in parallel, a new run only while MemAvailable exceeded 24 GB; a stopped batch
split once into singles). Verdicts: `reports/cb-1049-mine/runs/post-verdicts.json`.

| Run | Files | Exit | State | Wall s | Peak GB |
| - | - | - | - | - | - |
| packages-db-1 (packages/db/src/client/index.ts) | 1 | 0 | done | 188.9 | 4.1 |
| packages-inference-1 | 5 | -15 | stopped | 904.4 | 15.3 |
| packages-inference-2 | 5 | -15 | stopped | 906.4 | 3.0 |
| packages-inference-3 (packages/inference/src/roles/side-gen.ts) | 1 | -15 | stopped | 908.5 | 2.9 |
| packages-server-1 | 5 | -15 | stopped | 910.5 | 3.0 |
| packages-server-2 | 5 | -15 | stopped | 900.3 | 4.9 |
| packages-server-3 | 5 | -15 | stopped | 902.8 | 3.0 |
| packages-server-4 | 5 | -15 | stopped | 904.9 | 2.8 |
| packages-server-5 | 5 | -15 | stopped | 906.9 | 6.7 |
| packages-server-6 | 3 | -15 | stopped | 909.0 | 2.9 |
| tooling-1 | 5 | -15 | stopped | 902.6 | 9.0 |
| tooling-3 | 5 | 1 | done | 863.5 | 6.8 |
| tooling-2 | 5 | -15 | stopped | 901.1 | 2.9 |
| tooling-4 | 5 | -15 | stopped | 903.1 | 2.9 |
| tooling-5 | 5 | -15 | stopped | 905.1 | 2.7 |
| tooling-6 | 5 | -15 | stopped | 900.5 | 8.5 |
| tooling-7 | 5 | -15 | stopped | 900.2 | 10.1 |
| tooling-8 | 5 | -15 | stopped | 901.2 | 2.9 |
| tooling-9 | 5 | -15 | stopped | 903.3 | 5.2 |
| tooling-10 | 3 | -15 | stopped | 905.3 | 2.9 |
| packages-inference-1-single-catalog.ts (packages/inference/src/backends/agent-sdk/catalog.ts) | 1 | -15 | stopped | 900.6 | 4.2 |
| packages-inference-1-single-index.ts (packages/inference/src/backends/agent-sdk/index.ts) | 1 | -15 | stopped | 904.8 | 2.9 |
| packages-inference-1-single-index.ts (packages/inference/src/backends/anthropic-messages/index.ts) | 1 | -15 | stopped | 900.3 | 2.8 |
| packages-inference-1-single-diagnostics.ts (packages/inference/src/backends/openai-compat/diagnostics.ts) | 1 | -15 | stopped | 902.3 | 8.2 |
| packages-inference-1-single-reachability.ts (packages/inference/src/backends/openai-compat/reachability.ts) | 1 | -15 | stopped | 904.3 | 3.0 |
| packages-inference-2-single-google.ts (packages/inference/src/catalog/google.ts) | 1 | 0 | done | 188.4 | 3.9 |
| packages-inference-2-single-endpoint.ts (packages/inference/src/catalog/endpoint.ts) | 1 | -15 | stopped | 900.8 | 4.3 |
| packages-inference-2-single-providers.ts (packages/inference/src/registry/providers.ts) | 1 | 0 | done | 313.1 | 4.0 |
| packages-server-1-single-seed.ts (packages/server/src/domain/character/seeder/seed.ts) | 1 | 1 | done | 326.5 | 4.9 |
| packages-server-1-single-card.ts (packages/server/src/domain/character/persistence/card.ts) | 1 | 0 | done | 361.0 | 4.7 |
| packages-inference-2-single-listing.ts (packages/inference/src/catalog/listing.ts) | 1 | -15 | stopped | 903.0 | 6.1 |
| packages-inference-2-single-mirror.ts (packages/inference/src/catalog/mirror.ts) | 1 | -15 | stopped | 905.1 | 3.1 |
| packages-server-1-single-add.ts (packages/server/src/domain/credentials/verbs/add.ts) | 1 | 1 | done | 543.5 | 4.4 |
| packages-server-1-single-bus.ts (packages/server/src/domain/chat/bus.ts) | 1 | -15 | stopped | 900.4 | 5.1 |
| packages-server-1-single-engine.ts (packages/server/src/domain/chat/engine/engine.ts) | 1 | -15 | stopped | 902.0 | 2.8 |
| packages-server-2-single-analyze.ts (packages/server/src/domain/discovery/verbs/analyze.ts) | 1 | -15 | stopped | 901.0 | 5.3 |
| packages-server-2-single-import-bundle.ts (packages/server/src/domain/import/loader/import-bundle.ts) | 1 | -15 | stopped | 903.0 | 2.8 |
| packages-server-2-single-settle-import-memory.ts (packages/server/src/domain/import/verbs/settle-import-memory.ts) | 1 | -15 | stopped | 901.4 | 3.0 |
| packages-server-2-single-activate.ts (packages/server/src/domain/plugin/activation/activate.ts) | 1 | -15 | stopped | 900.5 | 6.7 |
| packages-server-2-single-portability-write.ts (packages/server/src/domain/rpg/persistence/portability-write.ts) | 1 | -15 | stopped | 904.5 | 2.9 |
| packages-server-3-single-register.ts (packages/server/src/domain/tool-use/verbs/register.ts) | 1 | 0 | done | 307.3 | 4.0 |
| packages-server-3-single-controller.ts (packages/server/src/domain/share/certificate/controller.ts) | 1 | 1 | done | 811.7 | 4.9 |
| packages-server-3-single-tool-round.ts (packages/server/src/domain/rpg/tools/rounds/tool-round.ts) | 1 | -15 | stopped | 900.8 | 6.0 |
| packages-server-3-single-execute-tool-calls.ts (packages/server/src/domain/tool-use/verbs/execute-tool-calls.ts) | 1 | 0 | done | 866.2 | 4.1 |
| packages-server-3-single-runner.ts (packages/server/src/domain/workloads/engine/runner.ts) | 1 | -15 | stopped | 904.8 | 6.6 |
| packages-server-4-single-start.ts (packages/server/src/domain/workloads/verbs/start.ts) | 1 | -15 | stopped | 904.0 | 2.7 |
| packages-server-4-single-reactivate-plugins.ts (packages/server/src/entry/boot/reactivate-plugins.ts) | 1 | -15 | stopped | 901.1 | 2.9 |
| packages-server-4-single-index.ts (packages/server/src/entry/index.ts) | 1 | -15 | stopped | 900.1 | 18.0 |
| packages-server-4-single-issuer.ts (packages/server/src/infra/acme/issuer.ts) | 1 | -15 | stopped | 904.6 | 2.9 |
| packages-server-4-single-key.ts (packages/server/src/infra/crypto/key.ts) | 1 | -15 | stopped | 903.4 | 3.0 |
| packages-server-5-single-broker-entry.ts (packages/server/src/infra/plugin-host/broker-entry.ts) | 1 | -15 | stopped | 903.2 | 3.0 |
| packages-server-5-single-membrane.ts (packages/server/src/infra/plugin-host/membrane.ts) | 1 | -15 | stopped | 903.2 | 8.1 |
| packages-server-5-single-process-runtime.ts (packages/server/src/infra/plugin-host/process-runtime.ts) | 1 | -15 | stopped | 903.2 | 2.9 |
| packages-server-5-single-warm-runtime-pool.ts (packages/server/src/infra/plugin-host/warm-runtime-pool.ts) | 1 | -15 | stopped | 902.5 | 2.9 |
| tooling-1-single-drive.ts (tooling/src/cache-check/ops/drive.ts) | 1 | 0 | done | 242.8 | 7.4 |
| packages-server-5-single-worker-runtime.ts (packages/server/src/infra/plugin-host/worker-runtime.ts) | 1 | -15 | stopped | 904.7 | 6.9 |
| packages-server-6-single-subscriptions.ts (packages/server/src/transport/trpc/subscriptions.ts) | 1 | 1 | done | 507.1 | 4.9 |
| packages-server-6-single-index.ts (packages/server/src/primitives/serde/lib/index.ts) | 1 | 1 | done | 642.6 | 4.8 |
| tooling-1-single-plans.ts (tooling/src/codemod/lib/plans.ts) | 1 | 0 | done | 260.0 | 4.9 |
| packages-server-6-single-cas.ts (packages/server/src/infra/storage/cas.ts) | 1 | -15 | stopped | 906.5 | 2.9 |
| tooling-1-single-boot-trace.ts (tooling/src/cpu-profile/ops/boot-trace.ts) | 1 | 0 | done | 287.4 | 5.3 |
| tooling-1-single-rated-theme-fixture.ts (tooling/src/floor/appearance/rated-theme-fixture.ts) | 1 | 0 | done | 363.5 | 5.3 |
| tooling-2-single-upload.ts (tooling/src/floor/browser/upload.ts) | 1 | 0 | done | 290.3 | 4.9 |
| tooling-1-single-browser.ts (tooling/src/floor/browser/browser.ts) | 1 | -15 | stopped | 904.4 | 7.1 |
| tooling-2-single-nav.ts (tooling/src/floor/instrument/nav.ts) | 1 | -15 | stopped | 902.3 | 2.9 |
| tooling-2-single-process-priority.ts (tooling/src/floor/process/process-priority.ts) | 1 | 1 | done | 677.0 | 5.0 |
| tooling-2-single-proc.ts (tooling/src/floor/process/proc.ts) | 1 | -15 | stopped | 904.9 | 4.8 |
| tooling-4-single-run-finding-analyzers.ts (tooling/src/snap/lib/run-finding-analyzers.ts) | 1 | 0 | done | 235.3 | 5.0 |
| tooling-2-single-run-marker.ts (tooling/src/floor/process/run-marker.ts) | 1 | -15 | stopped | 904.8 | 3.0 |
| tooling-4-single-appearance-density-persistence.ts (tooling/src/snap/ops/appearance-density-persistence.ts) | 1 | 0 | done | 631.6 | 5.8 |
| tooling-4-single-assert.ts (tooling/src/snap/ops/arms/assert.ts) | 1 | -15 | stopped | 900.3 | 2.8 |
| tooling-4-single-cascade.ts (tooling/src/snap/ops/arms/cascade.ts) | 1 | -15 | stopped | 900.0 | 3.0 |
| tooling-4-single-eval.ts (tooling/src/snap/ops/arms/eval.ts) | 1 | -15 | stopped | 900.2 | 3.0 |
| tooling-5-single-heap.ts (tooling/src/snap/ops/arms/heap.ts) | 1 | -15 | stopped | 901.4 | 16.5 |
| tooling-5-single-lighthouse.ts (tooling/src/snap/ops/arms/lighthouse.ts) | 1 | -15 | stopped | 901.5 | 2.9 |
| tooling-5-single-map.ts (tooling/src/snap/ops/arms/map.ts) | 1 | -15 | stopped | 901.6 | 3.0 |
| tooling-5-single-contrast-edge.ts (tooling/src/snap/ops/contrast-edge.ts) | 1 | 0 | done | 854.8 | 6.5 |
| tooling-5-single-profile.ts (tooling/src/snap/ops/arms/profile.ts) | 1 | -15 | stopped | 900.2 | 2.8 |
| tooling-6-single-contrast-fill.ts (tooling/src/snap/ops/contrast-fill.ts) | 1 | -15 | stopped | 904.8 | 6.5 |
| tooling-6-single-design-audit-walk.ts (tooling/src/snap/ops/design-audit-walk.ts) | 1 | -15 | stopped | 901.4 | 6.8 |
| tooling-6-single-drive-actions.ts (tooling/src/snap/ops/drive-actions.ts) | 1 | -15 | stopped | 903.5 | 2.9 |
| tooling-6-single-filmstrip-capture.ts (tooling/src/snap/ops/filmstrip-capture.ts) | 1 | -15 | stopped | 900.9 | 2.9 |
| tooling-6-single-guards.ts (tooling/src/snap/ops/guards.ts) | 1 | -15 | stopped | 900.9 | 3.1 |
| tooling-7-single-matrix.ts (tooling/src/snap/ops/matrix.ts) | 1 | -15 | stopped | 901.3 | 7.1 |
| tooling-7-single-session-call-watchdog.ts (tooling/src/snap/ops/session-call-watchdog.ts) | 1 | -15 | stopped | 903.7 | 2.9 |
| tooling-7-single-session-client.ts (tooling/src/snap/ops/session-client.ts) | 1 | -15 | stopped | 903.3 | 2.8 |
| tooling-7-single-session-daemon-request.ts (tooling/src/snap/ops/session-daemon-request.ts) | 1 | -15 | stopped | 901.1 | 7.0 |
| tooling-7-single-session-registry.ts (tooling/src/snap/ops/session-registry.ts) | 1 | -15 | stopped | 901.4 | 3.5 |
| tooling-8-single-stage-holders.ts (tooling/src/snap/ops/stage-holders.ts) | 1 | -15 | stopped | 900.1 | 5.1 |
| tooling-8-single-leader-record.ts (tooling/src/stack/lib/leader-record.ts) | 1 | -15 | stopped | 901.1 | 3.0 |
| tooling-8-single-spawn-lock.ts (tooling/src/stack/lib/spawn-lock.ts) | 1 | -15 | stopped | 902.9 | 2.9 |
| tooling-8-single-dev-down.ts (tooling/src/stack/ops/dev-down.ts) | 1 | -15 | stopped | 900.8 | 5.3 |
| tooling-8-single-prod-down.ts (tooling/src/stack/ops/prod-down.ts) | 1 | -15 | stopped | 904.8 | 3.1 |
| tooling-9-single-prod-support.ts (tooling/src/stack/ops/prod-support.ts) | 1 | -15 | stopped | 903.2 | 2.9 |
| tooling-9-single-prod-up.ts (tooling/src/stack/ops/prod-up.ts) | 1 | -15 | stopped | 903.7 | 6.5 |
| tooling-9-single-policy-repo-inventory.ts (tooling/src/verify/lib/policy-repo-inventory.ts) | 1 | -15 | stopped | 902.3 | 2.9 |
| tooling-9-single-resource-declaration.ts (tooling/src/verify/lib/resource-declaration.ts) | 1 | -15 | stopped | 903.5 | 3.0 |
| tooling-9-single-resource-config.ts (tooling/src/verify/ops/resource-config.ts) | 1 | -15 | stopped | 903.9 | 6.7 |
| tooling-10-single-resource-index.ts (tooling/src/verify/ops/resource-index.ts) | 1 | -15 | stopped | 904.8 | 5.6 |
| tooling-10-single-resource-installed.ts (tooling/src/verify/ops/resource-installed.ts) | 1 | -15 | stopped | 903.1 | 3.0 |
| tooling-10-single-typecheck.ts (tooling/src/verify/ops/typecheck.ts) | 1 | -15 | stopped | 903.6 | 7.9 |

Post-deletion pass (new reader, one file at a time): 6 of 6 verdicts, 0 effective findings, 0 alarms.

| Run | Files | Exit | State | Wall s | Peak GB |
| - | - | - | - | - | - |
| packages-server-1 (packages/server/src/domain/credentials/verbs/add.ts) | 1 | 0 | done | 252.1 | 4.3 |
| packages-server-2 (packages/server/src/domain/character/seeder/seed.ts) | 1 | 0 | done | 594.6 | 4.9 |
| packages-server-3 (packages/server/src/primitives/serde/lib/index.ts) | 1 | 0 | done | 417.5 | 5.0 |
| packages-server-4 (packages/server/src/transport/trpc/subscriptions.ts) | 1 | 0 | done | 546.7 | 5.1 |
| tooling-1 (tooling/src/floor/process/process-priority.ts) | 1 | 0 | done | 258.2 | 5.1 |
| tooling-2 (tooling/src/snap/lib/heap-devtools.ts) | 1 | 0 | done | 261.5 | 5.1 |

## Contention

Attempt 2 ran 5 runs in parallel on a box at load 18 to 23 of 24 cores, shared with a 1041 workflow and the barrier.
Singles that finished took 188 to 866 s, against 127.5 s for the solo kit probe, and 79 of 101 runs hit the 900 s stop.
The stops measure contention, not cost per file. No run in attempt 2 heap-aborted and the sweep found no orphans. The
client world is a separate cost: 5 client files heap-aborted the inventory worker at 16 GB, while 2 files finished at 4.4 GB.

## Not re-checked

119 candidate files (`reports/cb-1049-mine/cb-1049-candidates.tsv`: 156 markers, typed-refusal 84, rethrow 48,
errorToast 23, sole-op-default 1, selected from 681 markers in 385 files by stated owner and code shape; 4 sibling-lane
files and 2 `packages/contracts/src` files excluded). 25 reached a post-change verdict. These 94 did not, so their
markers stay and are not re-checked (`reports/cb-1049-mine/runs/rerun-list.txt`):

- packages/inference/src/backends/agent-sdk/catalog.ts
- packages/inference/src/backends/agent-sdk/index.ts
- packages/inference/src/backends/anthropic-messages/index.ts
- packages/inference/src/backends/openai-compat/diagnostics.ts
- packages/inference/src/backends/openai-compat/reachability.ts
- packages/inference/src/catalog/endpoint.ts
- packages/inference/src/catalog/listing.ts
- packages/inference/src/catalog/mirror.ts
- packages/inference/src/roles/side-gen.ts
- packages/server/src/domain/chat/bus.ts
- packages/server/src/domain/chat/engine/engine.ts
- packages/server/src/domain/discovery/verbs/analyze.ts
- packages/server/src/domain/import/loader/import-bundle.ts
- packages/server/src/domain/import/verbs/settle-import-memory.ts
- packages/server/src/domain/plugin/activation/activate.ts
- packages/server/src/domain/rpg/persistence/portability-write.ts
- packages/server/src/domain/rpg/tools/rounds/tool-round.ts
- packages/server/src/domain/workloads/engine/runner.ts
- packages/server/src/domain/workloads/verbs/start.ts
- packages/server/src/entry/boot/reactivate-plugins.ts
- packages/server/src/entry/index.ts
- packages/server/src/infra/acme/issuer.ts
- packages/server/src/infra/crypto/key.ts
- packages/server/src/infra/plugin-host/broker-entry.ts
- packages/server/src/infra/plugin-host/membrane.ts
- packages/server/src/infra/plugin-host/process-runtime.ts
- packages/server/src/infra/plugin-host/warm-runtime-pool.ts
- packages/server/src/infra/plugin-host/worker-runtime.ts
- packages/server/src/infra/storage/cas.ts
- tooling/src/floor/browser/browser.ts
- tooling/src/floor/instrument/nav.ts
- tooling/src/floor/process/proc.ts
- tooling/src/floor/process/run-marker.ts
- tooling/src/snap/ops/arms/assert.ts
- tooling/src/snap/ops/arms/cascade.ts
- tooling/src/snap/ops/arms/eval.ts
- tooling/src/snap/ops/arms/heap.ts
- tooling/src/snap/ops/arms/lighthouse.ts
- tooling/src/snap/ops/arms/map.ts
- tooling/src/snap/ops/arms/profile.ts
- tooling/src/snap/ops/contrast-fill.ts
- tooling/src/snap/ops/design-audit-walk.ts
- tooling/src/snap/ops/drive-actions.ts
- tooling/src/snap/ops/filmstrip-capture.ts
- tooling/src/snap/ops/guards.ts
- tooling/src/snap/ops/matrix.ts
- tooling/src/snap/ops/session-call-watchdog.ts
- tooling/src/snap/ops/session-client.ts
- tooling/src/snap/ops/session-daemon-request.ts
- tooling/src/snap/ops/session-registry.ts
- tooling/src/snap/ops/stage-holders.ts
- tooling/src/stack/lib/leader-record.ts
- tooling/src/stack/lib/spawn-lock.ts
- tooling/src/stack/ops/dev-down.ts
- tooling/src/stack/ops/prod-down.ts
- tooling/src/stack/ops/prod-support.ts
- tooling/src/stack/ops/prod-up.ts
- tooling/src/verify/lib/policy-repo-inventory.ts
- tooling/src/verify/lib/resource-declaration.ts
- tooling/src/verify/ops/resource-config.ts
- tooling/src/verify/ops/resource-index.ts
- tooling/src/verify/ops/resource-installed.ts
- tooling/src/verify/ops/typecheck.ts
- packages/client/src/agent-nav/index.ts
- packages/client/src/components/imported-chats-memory-offer.tsx
- packages/client/src/data/bus/post-event-source.ts
- packages/client/src/data/invalidation.ts
- packages/client/src/data/use-open-refinery.ts
- packages/client/src/features/chat/components/chat-documents-section.tsx
- packages/client/src/features/chat/components/gallery-upload-zone.tsx
- packages/client/src/features/chat/components/message-actions-row.tsx
- packages/client/src/features/chat/components/message-edit-textarea.tsx
- packages/client/src/features/credentials/components/add-connection-dialog.tsx
- packages/client/src/features/credentials/components/first-model-setup.tsx
- packages/client/src/features/imagery/components/image-detail-body.tsx
- packages/client/src/features/imagery/components/image-edit-body.tsx
- packages/client/src/features/notifications/components/notification-inbox-row.tsx
- packages/client/src/features/persona/components/persona-list.tsx
- packages/client/src/features/plugin/components/plugin-distribute-section.tsx
- packages/client/src/features/plugin/components/plugin-row-leaves.tsx
- packages/client/src/features/plugin/components/plugin-row.tsx
- packages/client/src/features/plugin/components/plugin-surface-renderer.tsx
- packages/client/src/features/plugin/components/snippet-console.tsx
- packages/client/src/features/plugin/lib/ui-guest/plugin-ui-guest-host.ts
- packages/client/src/features/plugin/lib/ui-guest/ui-guest.worker.ts
- packages/client/src/features/rpg/components/rpg-game-tab.tsx
- packages/client/src/features/rpg/components/rpg-populate-control.tsx
- packages/client/src/features/tag/components/labels-suggestions.tsx
- packages/client/src/features/tag/hooks/use-tag-library.ts
- packages/client/src/features/user-admin/components/admin-link-sso-dialog.tsx
- packages/client/src/features/user-admin/components/admin-reset-password-dialog.tsx
- packages/client/src/lib/use-router-url-replace.ts
- packages/client/src/lib/view-transition-settlement.ts
- packages/client/src/main.tsx

The 266 marker files outside the candidate list were not re-checked either. Their markers did not match a new owner kind
by reason text or code shape; the selection is heuristic, so some may also retire once a cheap whole-population run exists.

## Residual unknown

`packages/server/src/domain/share/certificate/controller.ts:53` (`run`) and `:54` (`operation.promise`): effective findings
with no marker and no census row. The census lists only `obtain::err` and `serve::err` for that file. controller.ts last
changed in `973da716eb`, after the census commit `0e1d471c30`. The HEAD-reader run reports the same two findings, so they
pre-date this change. They are real unproven sites that the committed census has never seen. The census batch itself is
unchanged between readers: `reindex-confirm.tsx:46` and `auth-bootstrap.ts:57` stay unproven, with the dead-position
alarm at `reindex-confirm.tsx:45`. Any other file changed after the census can carry the same kind of finding unseen.

## Vocabulary gaps (rule 1731)

| Value | Waiver sites | Meaning there | Typed home |
| - | - | - | - |
| `revoked` | anthropic-messages/index.ts:87, google/index.ts:36, openai-compat/diagnostics.ts:88 (all `packages/inference/src/backends/`) | the provider refused the credential (401/403) | member of exported `CredentialHealth.status` (packages/contracts/src/credentials/index.ts:45: ok, revoked, unreachable, throttled) |
| `down` | packages/inference/src/backends/openai-compat/reachability.ts:75 | the reachability probe failed | bare string member of exported `Reachability` (packages/inference/src/contract/runtime.ts:60: up, down, asleep, unknown) |
| `listed: false` | anthropic-messages/index.ts:76, packages/inference/src/catalog/listing.ts:117, both through `failedListing` (backends/wire/model-listing.ts:52, single return) | model discovery failed; carries the reason | boolean discriminant of exported `ModelListing` (packages/contracts/src/inference/catalog.ts:58) |
| `notUploaded` | packages/client/src/features/chat/components/gallery-upload-zone.tsx:77 | the upload was refused; the dropzone names it | `step: keyof Shortfall`, a local, non-exported interface (:23); the success answer is `null` |

The rule misfires as worded. Membership in an exported union holds for its success members too: every return of a
function typed `Reachability` or `CredentialHealth` is a member, so `catch { return "up"; }` or `{ status: "ok" }` would
count as an owner. The rule needs failure-member identification, not membership. It also leaves `notUploaded` a waiver
although every non-null member of its type is a refusal.

## Boolean follow-up (not in this commit)

ts-morph's `getLiteralValue()` returns undefined for `true` and `false` by design (boolean literal types are intrinsic;
pinned by native-failure-observations.test.ts). `typeIsFailureOutcome` (`caught-failure-outcome.ts`) reads `ok` through
`literalValue`, so its `ok === false` arm never matches by type. Route it through `primitiveFlags(part).booleanLiteral` plus
`defaultDisplay(part)`, as `classLiteralTypes` in static-class-semantic.ts does. That flips declared limit 7's mustFlag to a
mustPass, drops the limit, and retires more markers, so it needs its own red-first run and run set. Deferred: a reader
change mid-run would have mixed two readers. caught-failure-outcome.ts is at 447 of 450 lines.

## Verifier refutation of 67b039c944, and the fix

The verifier found fake owners credited by 67b039c944, all from dropping the caught-binding requirement on the
call path in `callIsFailureOutcome`:

- **P1, the factory parameter as the binding.** `factoryReturnsFailure` judged the helper's first parameter as the caught
  binding, so `pass([])`, `wrap(null)` (the `{ error: null }` cleared slot) and an errorToast of `pass('')` all owned.
  The same path fed React setter arguments and notify copy.
  - Fix: a factory body owns on its own only when it is failure-valued without its parameter, as `{ ok: false, reason }`
    is. A body failure-valued only through its parameter owns only when the call's first argument references the caught
    binding (`governedFailureFactoryCall`).
- **P2, members without a literal were filtered out.** `typeIsFailureOutcome` dropped union members with no literal value
  before its `every` test, so `{ status?: 'failed' }`, `{ status: 'error' } | { status: number }` and
  `{ kind: 'error' } | { kind: string & {} }` passed.
  - Fix: no filter. A member without a literal value fails the test. The boolean route stays out of scope: `ok` still
    reads through `literalValue`, which keeps declared limit 7 exact (conservative).
- **P3, a constructor in a sole-operation try.** `try { await m.mutateAsync(new Payload(raw)); } catch { return []; }` was
  credited.
  - Fix: `hasFrameworkOwner` refuses a try that also constructs (`new`) outside a nested function.
- **P3, guard narrowness was unpinned.** Pinned by a mustPass, not a mustFlag, because these shapes are credited BY DESIGN:
  `if (err instanceof TypeError) { throw err; }` and `if (err === err && false) { throw err; }`.

New rows:
- mustFlag `parameter-factories` (count 2);
- mustFlag `toast-identity` (1);
- mustFlag `nonliteral-discriminants` (3);
- mustFlag `sole-new` (1);
- mustPass `guard-narrowness`.

Red-first: the 75 / 34 rows on the 67b039c944 reader fail exactly the four new mustFlag rows
(`reports/cb-1049-mine/cb-1049-3-redfirst.log`). After the fix: 75 / 34 / 0.

The verifier's fixtures (`v1049-adversarial.ts`, `v1049-adversarial-2.ts`) went from 9 and 1 failures to 3 and 0. The
three left are outside the required set:
- `gr-return-first` (`if (isConflict(err)) { if (skip) { return; } throw err; }`) is the discriminated early-return shape
  the reader already credited before 1049;
- `gr-inner-try` and `gr-const-other-block` report 2 findings where the fixture expects 1, because the nested catch is a
  site of its own.

Serde re-judged: `refuse` (serde/lib/index.ts:109) returns `{ ok: false, reason }`, which is failure-valued without its
parameter, so both decodeObject sites still own. An in-memory run of the committed file under the fixed reader shows 0
findings and 0 alarms; the same probe under the HEAD reader showed both sites. The two deletions and their population
edits stand.

Risk not closed by a run: the fix narrows three credits the HEAD reader also gave. Those are the filtered non-literal
member, a `new` in a sole-operation try, and a factory that takes the binding in a later argument than the first. A live
site anywhere in the tree that relied on one of them would now be a finding. No scoped structure run has re-checked the
tree under the fixed reader. That is owed with the cheap rerun (item 1070).

## Commands and results

- `pnpm exec biome check <changed .ts files> --diagnostic-level=error`: 11 files, no errors (the 4 reader/gate files, the population record, and the 6 marker files).
- `pnpm typecheck --config tooling/tsconfig.json`: PASS. The server program was not typechecked: its edits are comment
  deletions only.
- Per-gate conformance: 71 / 33 / 0 at 67b039c944; 75 / 34 / 0 after the refutation fix.
- `pnpm test:scoped tests/tooling/verify/gates/caught-failure-census-row.test.ts`: 3 passed.
- `tests/tooling/verify/gates/caught-failure-ownership.repo.int.test.ts`: not run. It derives the whole population
  (`deriveCaughtFailurePopulation(repoRoot)`, at least 2000 files), so it is owed to primary.

## Owed

- The 94 no-verdict candidate files and the 266 non-candidate marker files: rerun once structure runs are cheap (item 1070).
- The repo integration test and a census regeneration check on the merged tree (primary).
- controller.ts:53/:54: two unproven sites missing from the census; a Phase 2 rejudge.
- The boolean read route above, and the vocabulary ruling once 1731 names failure members.

## Rerun on the merged reader

Main at 88d59254c7 includes the refutation fix and items 1070 and 1051 part 1. The 94 no-verdict candidate files were rerun as single files, 2 in parallel. Each run had its own setsid session, a 900 s stop and the MemAvailable gate. Walls ran from 40 s to 905 s, and the largest tree peak was 19.5 GB. Results: `reports/cb-1049-mine/runs/rerun-results.jsonl` and `rerun-verdicts.json`.

56 files reached a verdict, with 0 effective findings and 23 stale-waiver alarms. Each alarm was removed with its marker and its population row. Every alarmed path and token had exactly as many rows as markers. HEAD arms were read with the pre-1049 reader in memory, over the committed text.

| Owner kind | Marker (pre-deletion line) | HEAD arm |
| - | - | - |
| sole-operation default (imported errorToast mutation) | packages/client/src/features/imagery/components/image-detail-body.tsx:71 | default |
| guarded rethrow | packages/client/src/components/imported-chats-memory-offer.tsx:66 | empty |
| sole-operation default (imported errorToast mutation) | packages/client/src/features/user-admin/components/admin-reset-password-dialog.tsx:55 | default |
| typed refusal | packages/server/src/infra/acme/issuer.ts:107 | empty |
| guarded rethrow | packages/server/src/infra/storage/cas.ts:119 | empty |
| guarded rethrow | packages/server/src/infra/storage/cas.ts:215 | empty |
| guarded rethrow | packages/server/src/domain/discovery/verbs/analyze.ts:131 | empty |
| guarded rethrow | packages/server/src/domain/discovery/verbs/analyze.ts:73 | empty |
| guarded rethrow | packages/server/src/domain/import/verbs/settle-import-memory.ts:23 | empty |
| guarded rethrow | packages/server/src/domain/rpg/persistence/portability-write.ts:228 | empty |
| guarded rethrow | tooling/src/stack/lib/leader-record.ts:141 | empty |
| guarded rethrow | tooling/src/stack/lib/spawn-lock.ts:108 | empty |
| guarded rethrow | tooling/src/stack/lib/spawn-lock.ts:121 | empty |
| guarded rethrow | tooling/src/stack/lib/spawn-lock.ts:90 | empty |
| guarded rethrow | tooling/src/stack/ops/dev-down.ts:114 | empty |
| guarded rethrow | tooling/src/stack/ops/prod-down.ts:52 | empty |
| guarded rethrow | tooling/src/stack/ops/prod-down.ts:68 | empty |
| guarded rethrow | tooling/src/stack/ops/prod-support.ts:114 | empty |
| guarded rethrow | tooling/src/stack/ops/prod-support.ts:81 | empty |
| guarded rethrow | tooling/src/stack/ops/prod-up.ts:78 | empty |
| guarded rethrow | tooling/src/floor/process/proc.ts:273 | empty |
| guarded rethrow | tooling/src/floor/process/proc.ts:90 | empty |
| guarded rethrow | tooling/src/floor/process/run-marker.ts:215 | empty |

By kind: guarded rethrow 20, sole-operation default 2, typed refusal 1. Population totals: sites 688 to 665, `deliberate-absorb` 686 to 663, `default` 160 to 158, `empty` 347 to 326.

Post-deletion pass over the 16 changed files (`runs/postdel2-results.jsonl`): 16 verdicts, 0 findings, 0 alarms.

These 38 files still have no verdict. They keep their markers.

| File | Reason |
| - | - |
| packages/client/src/features/chat/components/chat-documents-section.tsx | stopped |
| packages/client/src/features/chat/components/gallery-upload-zone.tsx | stopped |
| packages/client/src/features/credentials/components/add-connection-dialog.tsx | heap abort |
| packages/client/src/features/credentials/components/first-model-setup.tsx | heap abort |
| packages/client/src/features/notifications/components/notification-inbox-row.tsx | heap abort |
| packages/client/src/features/persona/components/persona-list.tsx | heap abort |
| packages/client/src/features/plugin/components/plugin-distribute-section.tsx | heap abort |
| packages/client/src/features/plugin/components/plugin-row-leaves.tsx | stopped |
| packages/client/src/features/plugin/components/plugin-row.tsx | stopped |
| packages/client/src/features/plugin/components/plugin-surface-renderer.tsx | stopped |
| packages/client/src/features/rpg/components/rpg-game-tab.tsx | heap abort |
| packages/client/src/features/tag/components/labels-suggestions.tsx | heap abort |
| packages/server/src/domain/chat/engine/engine.ts | stopped |
| packages/server/src/domain/rpg/tools/rounds/tool-round.ts | stopped |
| packages/server/src/domain/workloads/engine/runner.ts | stopped |
| packages/server/src/entry/index.ts | stopped |
| packages/server/src/infra/crypto/key.ts | stopped |
| packages/server/src/infra/plugin-host/membrane.ts | stopped |
| packages/server/src/infra/plugin-host/process-runtime.ts | stopped |
| tooling/src/floor/browser/browser.ts | stopped |
| tooling/src/snap/ops/arms/assert.ts | stopped |
| tooling/src/snap/ops/arms/cascade.ts | stopped |
| tooling/src/snap/ops/arms/eval.ts | stopped |
| tooling/src/snap/ops/arms/heap.ts | stopped |
| tooling/src/snap/ops/arms/lighthouse.ts | stopped |
| tooling/src/snap/ops/arms/map.ts | stopped |
| tooling/src/snap/ops/arms/profile.ts | stopped |
| tooling/src/snap/ops/drive-actions.ts | exit 2 |
| tooling/src/snap/ops/design-audit-walk.ts | stopped |
| tooling/src/snap/ops/guards.ts | stopped |
| tooling/src/snap/ops/matrix.ts | stopped |
| tooling/src/snap/ops/session-client.ts | stopped |
| tooling/src/snap/ops/session-daemon-request.ts | stopped |
| tooling/src/snap/ops/session-registry.ts | stopped |
| tooling/src/snap/ops/stage-holders.ts | stopped |
| tooling/src/verify/lib/policy-repo-inventory.ts | stopped |
| tooling/src/verify/lib/resource-declaration.ts | stopped |
| tooling/src/verify/ops/resource-config.ts | stopped |
