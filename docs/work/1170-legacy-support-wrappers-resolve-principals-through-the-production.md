---
kind: bug
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-ad8ea7e6debbc80ff
plan: test-foundation
---

# Legacy support wrappers resolve Principals through the production resolver

## What

tsconfig.tests-legacy.json reports 1,522 type errors on main, mostly Principal shape and principalFor arity: legacy support wrappers still pass the role and handle overrides the testkit factory no longer takes. The commit hook skips the legacy programs, so nothing caught it locally.

## Why

D320 keeps legacy regression execution and native typecheck; a red legacy program loses the regression net the rebuild depends on, and the CI static job fails on it.

## Done when

Per the 1093 ruling, each legacy wrapper seeds an override role or handle on the user row through the production writer and resolves with createHostPrincipalResolver, and db-less unit files take the testkit in-memory database; no wrapper mints a Principal by hand; tsconfig.tests-legacy.json and tsconfig.tests-legacy-dom.json typecheck clean; the touched legacy suites keep their case lists and pass or keep only inherited reds.

## Evidence

Filled at landing: what ran and where its output is.
