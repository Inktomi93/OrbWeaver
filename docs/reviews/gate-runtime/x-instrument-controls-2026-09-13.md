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
