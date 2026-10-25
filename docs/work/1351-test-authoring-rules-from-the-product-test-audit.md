---
kind: tooling
status: doing
updated: 2026-10-25
priority: P1
area: tests
lane: cb-testlint
plan: test-foundation
---

# Test-authoring rules from the product-test audit land

## What

Seven rules: fixed or always-error tRPC responders, hand-typed appearance names in tests, story roots outside CtIsolation/CtClientProviders, hand-built shell DOM in stories, cross-feature test helper imports, hand-copied production labels, absence-only cases without a positive control. The surface harness moved onto serveCorpusProcedures; admin SSO link buttons gained distinct names.

## Why

An audit found tests passing over fabricated states and copied production values; owner: tests use the actual product.

## Done when

The branch passes review with every touched e2e spec run, all rules on at zero, and each of the four file-header exceptions judged against Spine-Testing section 9.

## State

- Branch `wt/agent-af01e0d3719ce9957`, merge `671f42d651` over `f52fdd5202`; verifier running.
- e2e: group-chat, multi-tab-room-sync, guided-generations and live-parity-plus-capstone pass (7). Corpus specs pass 176 across 7 of 9 mode cells; `corpus-shell.spec.ts:330` timed out in the whisper cell under load 22-43, and the runner crashed before the last two cells. Rerun those at low load before landing.
- The verifier judges the four file-header `orb/ct-responder-reads-input` exceptions, notably `tests/client/features/preset/components/list-lifetimes.ct.tsx`.

## Evidence

Filled at landing: what ran and where its output is.
