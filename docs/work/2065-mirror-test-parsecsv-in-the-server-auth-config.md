---
kind: bug
status: open
updated: 2026-11-07
priority: P2
area: server
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
