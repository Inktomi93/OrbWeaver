---
kind: bug
status: open
updated: 2026-10-19
priority: P1
---

# CI node job reds on main

## What

CI run 39279178336 (main 97b639a30d), job 'node (1/1)', fails in nine files. (1) The showcase plugin bundle is absent: tests/support/node/corpus-plugin-source.int.test.ts, tests/server/domain/plugin/seeder/seed-consent.int.test.ts, tests/server/domain/plugin/persistence/stored-management-boundaries.int.test.ts and likely tests/support/node/corpus-notifications.int.test.ts need packages/showcase-plugins/dist/bundles, gitignored build output; .github/workflows/ci.yml builds it for the CT job (near line 226) but not the node job. (2) 5 s default timeouts on the CI runner: tests/server/infra/network/scoped-endpoint-admission.test.ts, tests/support/node/plugin-lifetime.int.test.ts, tests/server/domain/notifications/verbs/standing-ask-lifetime.int.test.ts and tests/inference/backends/agent-sdk/private-diagnostics.int.test.ts. (3) tests/server/domain/connection/verbs/local-light-policy.int.test.ts: ensureUser hits a UNIQUE constraint other than the handle (an owner row under another handle).

## Why

CI is the verdict (D317). These tests pass on this box only because it holds untracked build output and runs faster.

## Done when

The node job builds the showcase bundle the way the CT job does before these tests run; each timeout is fixed at its cause or given a measured budget with its reason; the local-light-policy collision is fixed at its cause; the node job passes in CI.

## Evidence

Filled at landing: what ran and where its output is.
