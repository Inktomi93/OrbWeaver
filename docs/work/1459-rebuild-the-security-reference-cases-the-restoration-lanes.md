---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: security
plan: test-foundation
---

# Rebuild the security reference cases the restoration lanes moved

## What

Restoration lanes moved these legacy cases to a security batch. From plugin bridge.test.ts, through a real built guest (a showcase plugin or a toolchain-built test guest) on the production host: lore write first (macro neutralization, attached-book gate, per-plugin title namespace, 64-entry cap), then installer closure, viewer-visibility clamp, snippet identity, imagery, ingest and card-state slug stamping. From boot and env: the kept-keyfile and stranded session-secret warnings, the AUTH_FALLBACK-in-.env boot refusal, the inert SESSION_COOKIE_INSECURE cases and the processEnvSnapshot copy (tests/support/node/env-file-child.ts drives the .env cases). The case maps in docs/plans/test-foundation/design.md name each case.

## Why

These cases test plugin capability enforcement and secrets and auth posture, which is security-role work; route to security-executor. A real guest is available in tests, so nothing blocks them. The lore-write case pins a capability bypass and goes first.

## Done when

Each case is rebuilt through production with a planted-defect red, and the bridge, data-layout, env-file-load and floor-defaults register rows name no security remainder.

## Evidence

Filled at landing: what ran and where its output is.
