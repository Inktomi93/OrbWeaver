---
kind: bug
status: open
updated: 2026-10-19
priority: P1
---

# schema-data-grants real-corpus run runs out of heap at 16 GB

## What

tests/tooling/verify/gates/schema-data-grants.suite.repo.int.test.ts on main fails after about 20 minutes: the contract-verb-presence native inventory fixture dies with a V8 out-of-memory at about 16 GB. Same family as 1098 and 965.

## Why

The hosted CI runner has 16 GB, so this suite cannot give a verdict in CI.

## Done when

The suite completes under 16 GB on main with a measured peak, with no heap increase and no hidden population cut (D328).

## Evidence

Cause: the contract-verb-presence planner asked one `type-constituents` question. It named every called name in the population, at every receiver nominee. A syntactic census shows 110,978 nominees times 7,999 names, at least 887 million named-property questions. The reader asks a nominee only about the name of the call that nominated it, and only in domain tests. That is about 92 thousand questions.

Baseline on `ddbecb7b5e`: the suite hit the 30-minute group ceiling with no verdict. Its single-process peak was 18.45 GB and its tree peak 18.89 GB.

The owner ruling D321 replaces the gate with CI V8 coverage, so the gate is deleted instead of repaired.

Successor (D321):

- `scripts/ci-verb-coverage.ts` runs the server suite, `tests/server/` and `tests/legacy/server/`, under native V8 coverage.
- It reads coverage only for `packages/server/src/domain/*/service.ts` and `packages/server/src/domain/*/verbs/**/*.ts`.
- It requires 100% function coverage per file, through `--coverage.thresholds.perFile` and `--coverage.thresholds.functions=100`.
- `reports/verb-coverage/coverage-final.json` is the audit output.
- It runs as the "Domain verb coverage" step of the CI `node` job, after the strict shard.
- Red first, scoped to `tests/server/domain/settings/verbs/tenant-kv.int.test.ts`:
  - A planted uncalled verb in `settings/verbs/global-settings.ts` failed with "Coverage for functions (80%) does not meet global threshold (100%)".
  - A planted unimported file under `settings/verbs/` failed with 0%.
  - The clean tree passed at 100%.
- Parity with the deleted rows: a verb that does not execute fails, whether it is local, inherited, named only in a comment, or shadowed by a same-named helper. An executed verb passes, whatever its receiver shape.
- Lost claim: a verb whose implementation lives outside `service.ts` and `verbs/**`, for example a function imported from `engine/` and wired directly.
- Owed: a whole-suite run of the successor on the real tree. Its shortfall is not measured yet.

After the deletion the suite still runs out of heap. The run took 29:25 and exited 2. Its single-process peak was 21.24 GB and its tree peak 21.75 GB. The native inventory fixture child hit the 16 GiB heap at 1,505 s. The failure surfaced in the `finish` phase of `drizzle-schema-data`, `drizzle-schema-identities` and `drizzle-schema-vocabulary` (`tooling/src/verify/lib/schema-fact.ts`). These facts report the fixture failure; whether the child also carried the other facts' requests is not yet established. The planner that fills its heap is not yet measured; the next step is a per-request heap breakdown of that child.
