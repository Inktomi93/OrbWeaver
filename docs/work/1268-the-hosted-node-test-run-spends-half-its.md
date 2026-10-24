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

Filled at landing: what ran and where its output is.
