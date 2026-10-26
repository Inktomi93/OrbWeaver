# Project-selection CI closeout

## Diagnosis

The CI artifact `/tmp/orb-ci-40242985011-failed.log` records completion timeouts, not selector disagreement: the first corpus matrix reaches its parent ceiling, the parallel comparison reaches its parent ceiling, and unmatched-project collection reaches the default short case ceiling. The filtered matrix, malformed option/configuration refusals and corpus clone-cleanup cases complete in that run.

The comparison starts each `SELECTORS` member's native collection and configuration probe simultaneously. This multiplies cold configuration/spec imports across subprocesses. A native child can outlive the case because its inherited subprocess deadline exceeds the case deadline. The public wrapper instead gives child and parent equal deadlines, leaving no completion/cleanup headroom.

Fresh-process diagnostics on the unchanged source retain actual native/public CLI behavior:

| Operation | Observation |
| - | - |
| Selected phone corpus matrix | Exit 0; mode selection at 2.722 seconds, owned clone at 6.470 seconds, native listing at 19.060 seconds, joined completion at 19.365 seconds. Clone and parent are absent afterward. |
| Unmatched native project | Exit 1 with native refusal; completion at 2.811 seconds. |
| Configuration probe | Exit 0; completion at 2.848 seconds. |

Raw output is retained at `/tmp/ci-project-selection-cold-phases.json`, `/tmp/ci-project-selection-cold-matrix.log`, `/tmp/ci-project-selection-cold-unmatched.log` and `/tmp/ci-project-selection-cold-config.log`. Hardware qualification is absent, timing policy is `record`, and observed load is below the available CPU count. These are diagnostic measurements, not D308 performance passes or hosted-CI latency promises.

No functional selector CLI bug is established. The public CLI and testkit import graph remain unchanged.

## Repair boundary

Each selector retains its actual native collector, independent configuration probe and shared seed-selector comparison. Cases run independently, with their child processes sequential instead of a process fanout. Repeated, variadic, equals, wildcard and native-terminator forms remain covered. Native unmatched, missing-value and missing-configuration refusals remain covered. Public matrix/file-filter assertions and both owned-clone cleanup cases remain intact.

The existing long-case unit supplies execution hang ceilings. Native collection uses one unit; the public smoke wrapper uses its corpus/native phases; matrix adds its mode-selection phase. Parent deadlines sum already-scaled sequential execution windows and a joined-cleanup reserve. Summing the scaled windows prevents the global scaling cap from collapsing parent and child deadlines together. These are completion limits, not measured-rate or latency assertions.

A private local helper uses verified Vitest `signal` and `onTestFinished`, the existing transcript process door and fresh run leases. Cancellation targets its own child group. Native finish cleanup joins the exact owned lease and the same child promise before the case ends. The subprocess timeout path also joins that lease. No new global tag, subprocess API, policy framework or cleanup authority is added.

The cancellation control starts a real child, aborts only after its ready output, requires a signal termination without the process deadline diagnostic, and checks owned-lease completion after native finish cleanup.

## Verification

- The missing-signal-listener source control fails only because its ready child reaches the subprocess execution deadline. The ordinary deadline cannot counterfeit cancellation. Evidence: `/tmp/ci-project-selection-cancel-red.log`, `/tmp/ci-project-selection-cancel-red.json`. The exact source snapshot is restored before acceptance checks.
- `pnpm typecheck tsconfig.json` passes, including the router prerequisite. Evidence: `/tmp/ci-project-selection-typecheck.log`.
- Scoped Biome and ESLint pass. Evidence: `/tmp/ci-project-selection-biome.log`, `/tmp/ci-project-selection-eslint.log`.
- `pnpm test tests/e2e/support/project-selection.int.test.ts --reporter=default --reporter=json --outputFile=/tmp/ci-project-selection-final.json` reports 12 passed, 1 failed and no skipped cases. Evidence: `/tmp/ci-project-selection-final.log`, `/tmp/ci-project-selection-final.json`.

The cancellation control completes by signal, not by its deadline, and its native finish hook confirms an empty owned lease. All selector comparisons, native option/configuration refusals, matrix assertions and selected-smoke clone cleanup pass. No selector assertion or owned-clone assertion is weakened.

### Completion metadata blocker

The remaining empty-selection smoke case reaches the real native `No tests found` refusal and exit 1. Its public wrapper then fails closed during existing `joinEscaped` cleanup, returns exit 2 and retains `/tmp/orb-corpus-fixture-76Nflo`. The retained directory is evidence, not a passing cleanup result.

The completion reader cannot read candidate PID 1797754's environment (`EACCES`). Its observed start is `223628463`, all recorded UIDs are 1000, and parent PID 1797742 is `runc`. Owner PID 1797345 starts at `223627796`. The available command line contains no marker; an unreadable environment does not prove that the process is unowned. The existing reader revalidates metadata and refuses to invent authority.

Independent read-only adjudication finds no warranted process-reader repair. The candidate, parent and owner are subsequently absent; that does not retroactively make the failed cleanup pass. No process is killed outside its owned lease and the original retained directory is not deleted. Public CLI, process-reader and testkit code remain unchanged.

### Changed-host-state qualification

A fresh readiness record at `/tmp/ci-project-selection-readiness.json` confirms that the observed candidate, parent and owner PIDs are absent. After that concrete apparatus-state qualification, the owner authorizes one fresh isolated empty-selection execution on the same frozen source. No process-reader allowance or source change is added.

`pnpm test tests/e2e/support/project-selection.int.test.ts --testNamePattern='public corpus smoke runner propagates empty selection' --reporter=default --reporter=json --outputFile=/tmp/ci-project-selection-empty-fresh.json` passes the selected case; the other cases are filtered out. Evidence: `/tmp/ci-project-selection-empty-fresh.log`, `/tmp/ci-project-selection-empty-fresh.json`.

This fresh public wrapper reaches the native refusal and completes its own clone and parent cleanup. That case composes with the unchanged matching passes from the full selection. The full-selection artifact remains a failed aggregate; its unavailable cleanup and original retained clone are not retroactively marked successful. No repeated-attempt loop or automatic retry is introduced. Hosted CI remains the application verdict.
