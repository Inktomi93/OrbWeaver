---
kind: bug
status: open
updated: 2026-10-22
priority: P2
area: testkit
plan: test-foundation
---

# Qualify hosted corpus and compaction runtime cases

## What

Qualify hosted execution of corpus search, completed-capsule cloning and the managed-compaction pre-turn threshold case. Diagnose setup cost, contention or blocked resource lifetimes before changing a timeout.

## Why

These cases pass locally but time out in the hosted Node suite. Local results do not establish hosted qualification.

## Done when

The named cases complete on the hosted runner with their ownership, output and cleanup assertions intact. Explain the cause before changing timing budgets. Keep production composition and synthetic corpus data.

## Evidence

The [hosted Node job](https://github.com/Inktomi93/OrbWeaver/actions/runs/39703507878/job/119578008178) reports timeouts in:

- `tests/support/node/corpus-search.int.test.ts`: native routed search and publication.
- `tests/support/node/corpus.int.test.ts`: completed migrated capsule and independent DB/CAS clone.
- `tests/server/domain/chat/engine/managed-compaction.suite.int.test.ts`: pre-turn threshold one-row-short refusal.

The local application run passes these cases and the producer, fixture, library-clone, search-publication and fixture-lifetime suites. No timeout cause is established by that local success.
