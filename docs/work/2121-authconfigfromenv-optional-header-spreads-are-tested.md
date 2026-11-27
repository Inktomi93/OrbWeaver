---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: security
lane: wt/agent-a107cca3f11de43e4
plan: test-foundation
---

# authConfigFromEnv optional header spreads are tested

## What

The optional header spreads in authConfigFromEnv have no test that fails when one is dropped; mutation testing leaves them surviving.

## Why

A dropped optional header silently changes what the forward-auth path trusts.

## Done when

pnpm test:mutation on the auth config file kills every mutant in the optional header spreads.

## Evidence

Filled at landing: what ran and where its output is.
