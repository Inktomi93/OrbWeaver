---
kind: bug
status: open
updated: 2026-10-20
priority: P1
plan: test-foundation
---

# schema-data-grants real-corpus run runs out of heap at 16 GB

## What

tests/tooling/verify/gates/schema-data-grants.suite.repo.int.test.ts on main fails after about 20 minutes: the contract-verb-presence native inventory fixture dies with a V8 out-of-memory at about 16 GB. Same family as 1098 and 965.

## Why

The hosted CI runner has 16 GB, so this suite cannot give a verdict in CI.

## Done when

The suite completes under 16 GB on main with a measured peak, with no heap increase and no hidden population cut (D328).

## Evidence

- Baseline on `ddbecb7b5e`: the suite hit the 30-minute ceiling with no verdict, at an 18.45 GB single-process peak. The contract-verb-presence planner asked every called name at every receiver nominee.
- D321 replaces that gate with CI V8 coverage. The node shards record coverage; the CI `verb-coverage` job judges it with `scripts/ci-verb-coverage.ts`. The judge resolves every exported domain `*Service` verb to its implementing function and fails a verb no shard ran. A planted uncalled verb read NOT EXECUTED through the real path.
- A higher-order wrapper (`claim(createVerb(...))`) resolves to the function it takes, so each wrapped verb is judged by its own body.
- D328 lost claims, each reported unjudged by name and not failing the run: a verb read off a parameter or computed by an expression such as `a ?? b`; a wrapper that takes several functions of the type it returns, or sits past the step bound; one function behind two different verb names; a member whose type mixes callable and data parts.
- Release qualification runs no judge of its own. It requires the green push run on the release SHA, and that run's `verb-coverage` job judges strict and legacy shards together.
- The dead `chat.getRoomOverridesForChat` and `DiscoveryService.themes` verbs are removed. `sessions.getOwnerUserId` executes under an existing domain test.
- After the deletion the suite still runs out of heap, at a 21.24 GB peak. A subset breakdown points at the `json-column-writes` ordinary cohort, which roots every call in its population. Narrowing its roots needs a capture-side design.
- Details and every measurement: `reports/review/1117-verb-coverage-and-schema-heap.md`.
- Owed: the real-tree judge run on CI shard reports, and the final suite run after item 1133.

The assigned worktree is removed. Its detailed evidence is preserved in `reports/review/salvage/agent-sweep-2026-10-20/agent-ab34ba7b0261ff67a/reports/review/1117-verb-coverage-and-schema-heap.md`. Final suite and CI coverage qualification remain owed.

The repaired capture still exceeds the aggregate memory budget during actual complete-policy qualification. The stopped run supplies no owner or authority verdict. Evidence: `reports/review/1153-real-policy-resource-failure.md`.
