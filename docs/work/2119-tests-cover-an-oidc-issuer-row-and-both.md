---
kind: work
status: open
updated: 2026-11-08
priority: P2
area: security
plan: test-foundation
---

# Tests cover an OIDC_ISSUER row and both connect-time gates under the port rules

## What

No committed test covers an OIDC_ISSUER allowlist row or either connect-time egress gate under the port rules. Add them following tests that cover endpoint connector ports.

## Why

The port rule closed a real hole on the owner's deployment, and nothing pins it at the issuer or the connect-time gates.

## Done when

Tests admit the issuer at 443, refuse it on another port, and go red when either connect-time gate drops the port check.

## Evidence

Filled at landing: what ran and where its output is.
