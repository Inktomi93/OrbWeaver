---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: server
lane: wt/agent-a70dd9d31997dbde4
plan: test-foundation
---

# Mirror-test parseCsv in the server auth config

## What

parseCsv in the server auth config builds the forward-header trusted-proxy list and has surviving mutants under pnpm test:mutation.

## Why

A wrong trusted-proxy list lets a forged forward header through, and no mirrored test would fail.

## Done when

pnpm test:mutation on the auth config file kills the parseCsv mutants through tests at the production entry, and the legacy reference case is compared first.

## Evidence

Filled at landing: what ran and where its output is.
