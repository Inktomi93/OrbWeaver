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

## Evidence

Filled at landing: what ran and where its output is.
