---
kind: work
status: open
updated: 2026-10-20
priority: P3
area: security
---

# Auth plumbing leftovers the 1194 rebuild found

## What

AuthSeamResolution.csrfHeaderPresent is computed by the seam but never read; createApp re-derives it from headers (packages/server/src/entry/app.ts:372), two homes for one signal. The no-id_token grant degrade in auth-routes is unreachable because openid-client refuses that grant, leaving a dead null-hint branch. The bundle route passes ownerId: principal.userId to workloads.start, but resolveRunOwner (packages/server/src/domain/workloads/verbs/start.ts:91) stamps the owner from the caller, so the argument reads like a control and is not one. tooling/ci-duration-weights.json still lists four deleted legacy files.

## Why

Dead or duplicate security signals invite a future reader to trust the wrong control.

## Done when

csrfHeaderPresent has one home, the dead degrade branch is removed, the ignored ownerId argument is removed or made the actual control with a test, and ci-duration-weights is regenerated.

## Evidence

Filled at landing: what ran and where its output is.
