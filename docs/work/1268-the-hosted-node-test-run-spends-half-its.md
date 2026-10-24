---
kind: tooling
status: open
updated: 2026-10-24
priority: P2
area: ci
---

# The hosted Node test run spends half its time importing the server graph

## What

The hosted Node run (`pnpm test --maxWorkers=2`, see `.github/workflows/`) took 1245 s with import at 50% of the run in its own duration line, while the same suite locally with `--no-isolate --maxWorkers=4` takes 263 s with tests at 93%. Each test file re-imports the server composition graph when files run isolated. Separately, six files take 30 to 56 s each and bound the critical path: `tests/inference/backends/agent-sdk/private-diagnostics.int.test.ts`, `tests/support/node/corpus-private.int.test.ts` (a synchronous `pnpm` spawn of the corpus CLI), `tests/server/domain/chat/persistence/continue-restore-races.suite.int.test.ts`, `tests/server/domain/chat/engine/managed-compaction.suite.int.test.ts`, `tests/support/node/corpus.int.test.ts`, `tests/server/infra/plugin-host/process-runtime.int.test.ts`.

## Why

CI is the verdict (D317) and must fit a standard runner; a twenty-minute Node job that spends ten minutes on imports slows every push for no proof gained.

## Done when

The hosted Node run uses the same isolation posture the local floor uses, or the reason it cannot is written in the workflow; the run's import share is under a tenth of its duration; each of the six files either states in its header why its wall time is intrinsic (a real spawn, a real timing floor) or is split so no file exceeds 20 s alone; the durations are read from the completed runner output, not estimated.

## Evidence

Filled at landing: what ran and where its output is.
