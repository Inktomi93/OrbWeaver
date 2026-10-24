---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: ci
---

# The hosted Node test run spends half its time importing the server graph

## What

Six Node test files take 30 to 56 s each on the local floor and bound the critical path of every full run: `tests/inference/backends/agent-sdk/private-diagnostics.int.test.ts`, `tests/support/node/corpus-private.int.test.ts` (a synchronous `pnpm` spawn of the corpus CLI), `tests/server/domain/chat/persistence/continue-restore-races.suite.int.test.ts`, `tests/server/domain/chat/engine/managed-compaction.suite.int.test.ts`, `tests/support/node/corpus.int.test.ts`, `tests/server/infra/plugin-host/process-runtime.int.test.ts`. The full suite locally takes 263 s at four workers with tests at 93% of the run. The integration project runs with `isolate: false` in `vitest.config.ts`, so the hosted run (`pnpm test --maxWorkers=2` in `.github/workflows/ci.yml`) shares the module registry too; its last recorded run predates that change and showed import at half its duration, so the hosted figure is unmeasured until the next push.

## Why

CI is the verdict (D317) and must fit a standard runner; a file that holds a worker for a minute sets the floor of every run.

## Done when

Each of the six files either states in its header why its wall time is intrinsic (a real spawn, a real timing floor) or is split so no file exceeds 20 s alone; the next hosted run's duration line is read from the completed runner output and recorded here, and if import is still above a tenth of the run the cause is named.

## Evidence

Each file run alone with `pnpm test <file> --maxWorkers=1`, durations from the native JSON report; the load column is the one-minute loadavg on the 24-core box.

| File | Before (s, load) | After (s, load) | Shape |
| - | - | - | - |
| `agent-sdk/private-diagnostics` | 43.3, 9.8 | 12.5, 18.6 | split; `-redaction` 9.0, 15.7 and `-framing` 12.3, 14.7; the native parent per case is the subject (`private-diagnostics.fixtures.ts`) |
| `support/node/corpus-private` | 41.4, 10.1 | 32.9, 21.9 | one intrinsic case: private intake runs every producer; header states it; output admission moved to `corpus-private-admission` (6.1, 19.4) |
| `chat/persistence/continue-restore-races` | 22.3, 14.2 | 2.1, 10.3 | split by method and race family into four `continue-{undo,revert}-{row,snapshot}-races` files, 3.6 to 8.6 each |
| `chat/engine/managed-compaction` | 19.7, 12.4 | 6.8, 12.9 | split; `-thresholds` 5.7 (searches run concurrently) and `-trim` 2.2 |
| `support/node/corpus` | 4.6, 15.1 | 5.1, 19.1 | unchanged; already warms the clone graph at import |
| `plugin-host/process-runtime` | 17.4, 7.5 | 4.2, 8.2 | split; `-lifecycle` 5.4 and `-continuations` 5.4; one real watchdog child per case |

The hosted run's duration line is not yet recorded: it needs the next push.
