---
kind: work
status: open
updated: 2026-10-22
priority: P2
area: tests
plan: test-foundation
---

# Qualify the existing OIDC pending-join E2E

## What

Qualify the existing OIDC pending-join E2E spec with its HTTPS issuer and isolated mode. Exercise invite signup, callback handling, pending-join display and dismissal.

## Why

The implemented fixture and spec still need completed runtime acceptance through the actual authentication path.

## Done when

The OIDC pending-join spec passes against the real server and HTTPS issuer. Verify state and nonce handling, trusted issuer configuration and preservation of unrelated query and history state.

## Evidence

`tests/e2e/oidc-pending-join.oidc.spec.ts`, `tests/e2e/support/oidc-issuer.ts` and `tests/e2e/support/modes.ts` contain the implementation. No replacement issuer project is required.
