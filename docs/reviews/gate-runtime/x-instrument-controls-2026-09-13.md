---
kind: evidence
status: active
updated: 2026-09-13
---

# #2248 / #2284 — instrument control repairs

## #2248 — deterministic live-run ordering

The concurrent artifact proof now establishes its two required events directly. The outer test starts the
leader and waits for its `.inflight` marker before starting the follower. Inside the planted gate, the first
run waits for an acknowledgement that the second run writes only after opening and scanning its own slot.
The follower returns immediately; it cannot wait for a leader that has already received the acknowledgement
and departed. The assertions retain the exact two-slot census: the follower names the live leader, while the
leader's earlier census is empty.

A deliberate cut removed the leader's acknowledgement wait. The file failed exactly the concurrency case:
the follower's `concurrent` census was empty instead of containing the leader; the other 10 tests passed.
The restored file passed three sequential runs of 11/11. Vitest durations were 5.42s, 5.48s, and 5.43s;
process wall times were 8.81s, 7.83s, and 7.84s. The 50-second loop remains only a broken-child failsafe.

## #2284 — production-arity range capture

The ledger integration fixture now plants seven commits whose real `git log` output exceeds 1 MiB and calls
`readClaimRange(root, base, "HEAD")` without the optional ceiling. It asserts the captured byte count, parses
all seven commits, and checks a changed path. This reaches the same default-arity reader used by
`ledgerClaims`; the existing explicit small/ample ceiling arms and spawn-ENOENT refusal remain intact.

A deliberate source cut changed the production default from 256 MiB to 1 KiB. The new production-arity case
failed at `readClaimRange` with its ENOBUFS refusal, while both existing controls passed. The exact source
bytes were then restored. The restored integration file passed 3/3.

## Verification

- `pnpm test:scoped tests/tooling/_shared/artifacts.int.test.ts`: 11/11 passed in each of three sequential runs.
- `pnpm test:scoped tests/tooling/verify/ops/ledger-claims.int.test.ts`: 3/3 passed after both exact restorations.
- The #2248 broken-ordering cut failed 1/11 at the exact follower census assertion.
- The #2284 256 MiB to 1 KiB cut failed 1/3 at the new default-arity capture assertion.
- Scoped Biome and ESLint passed for both test files.
- `pnpm typecheck --config tooling/tsconfig.json`: one runnable program passed.
- The report-only documentation formatter check passed. A whole-tree `check:docs` attempt remained red on the
  pre-existing 149-file formatting backlog and the existing refusal in `v-fix-wave-4-2026-09-12.md`; it did
  not identify this report.

The changes are test and evidence only. They do not alter artifact publication, range parsing, or capture
limits. No whole-tree battery, lifecycle operation, catalog change, or browser test was run.

## Review correction

Independent behavioral review accepted all 14 tests and both proof controls, then found two comments beside
the concurrency case that still described the retired 1.5-second sleep as the current mechanism. The
comments now describe the actual acknowledgement protocol and its 50-second broken-child failsafe. No
protocol, assertion, production source, or measured receipt changed in this correction.

## Integrated verification

Main `f46bae5ce` plus `a79523d60` includes the behavioral repair and both corrected proof comments. The independent review below accepted behavior and identified only the stale prose; the primary read the exact corrective diff before integration. Main ran both integration files: 14/14 passed, concurrency case 3.251s, artifact `reports/runs/test/main-893628-2026-09-13T08-36-10-127Z/test-report.json`. Native `tsconfig.json` passed, covering the changed test program.

# Independent review — `6e53b3138` instrument controls

## Verdict: REFUTED as-is; both behavioral controls are accepted

I found no behavioral defect in either new proof. The commit still carries two materially stale explanations
inside the #2248 load-bearing test, both claiming the planted gate sleeps for 1.5 seconds after the repair
removed that mechanism. Correct those comments before integration; no test or runtime redesign is needed.

## #2248 — behavioral proof accepted

The ordering is real and matches `openRunSlot`'s production sequence. Production scans other live markers
before writing its own marker (`tooling/src/_shared/artifacts.ts:176-187`). The outer test starts the leader,
then `leaderRunId` waits for the leader's actual `.inflight` marker before it starts the follower
(`tests/tooling/_shared/artifacts.int.test.ts:118-174`). The follower's gate executes only after its own slot
has opened and been scanned; seeing two open markers makes it write the acknowledgement and return
(`:52-63`). The leader alone waits for that acknowledgement. The final assertions identify the follower by
excluding the captured leader id, require exactly one follower, require that follower to name the leader,
and require the leader's earlier census to be empty (`:177-203`). This retains the exact two-slot census and
would red if the starts were unordered.

Failure and cleanup ownership is bounded, although not all at the test helper itself. `runCli` delegates to
`spawnNiced`; that production helper creates a detached group, installs a timer, kills the whole group on
expiry, rejects on spawn error and resolves on close (`tooling/src/_shared/proc.ts:362-395`). The planted
leader's acknowledgement wait itself ends after 2,000 x 25ms = 50s (`artifacts.int.test.ts:41-63`), below the
case's scaled 60s Vitest budget. `leaderRunId` has no independent deadline, so a pre-marker hang can outlive
the Vitest case until `spawnNiced`'s own timeout, but it remains owned and is eventually group-killed; this is
a limitation, not the unowned detached-child defect found in the separate #2225b change.

Confirmed prose defect:

- `tests/tooling/_shared/artifacts.int.test.ts:160-161` says all three cases spawn children and the planted
  gate "SLEEPS 1.5s". The current gate uses an acknowledgement and only its broken-child fallback can wait.
- `tests/tooling/_shared/artifacts.int.test.ts:167-171` again says `SLOW_GATE sleeps 1.5s inside runPass`.
  The relevant true statement is that the leader remains in `runPass` until the follower acknowledges its
  post-scan state.

These comments explain why the concurrency observation is valid, so leaving the obsolete timing mechanism
in them makes the proof harder to audit and contradicts the report's central claim.

## #2284 — accepted

The new row calls `readClaimRange(scratch, base, "HEAD")` with production arity, creates seven commits whose
actual `git log` stream exceeds 1 MiB, and requires the whole byte stream to parse as seven commits with a
real changed path (`tests/tooling/verify/ops/ledger-claims.int.test.ts:84-97`). It therefore reaches the
256 MiB default at `tooling/src/verify/ops/ledger-claims.ts:212-230`; the existing explicit tiny and ample
ceiling arms remain (`ledger-claims.int.test.ts:62-82`) and the spawn-ENOENT classification remains
(`:99-108`). The fixture uses synchronous children through the shared `runNicedSync` door, so it introduces
no asynchronous cleanup or orphan ownership problem.

The proof establishes that the production default is above Node's roughly 1 MiB default and that the range
is fully parsed. It does not allocate near 256 MiB or prove that every conceivable merge train fits; that is
consistent with the bounded ceiling contract.

## Independent receipt

`pnpm test:scoped tests/tooling/_shared/artifacts.int.test.ts tests/tooling/verify/ops/ledger-claims.int.test.ts`
passed 14/14 (11 artifact tests, 3 ledger tests). The concurrency case completed in 2.943s and the full
artifact file in 5.846s. Artifact:
`reports/runs/test/codex-planter-residue-879549-2026-09-13T08-33-11-822Z/test-report.json`.

I did not repeat the builder's three-run stability sample or source cuts, and I ran no broad battery,
typecheck, lint, lifecycle operation or tracked edit. The worktree remained clean.
