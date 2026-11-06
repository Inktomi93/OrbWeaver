---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# Distributed-plugin fan-out reads its stored bundle through the read-back parse, so a pre-retirement bundle does not block the published set

## What

Make the distributed-plugin fan-out read each stored bundle through the read-back parse, so a bundle stored before a plugin was removed from the product does not block the published set.

## Why

The per-recipient fan-out in packages/server/src/domain/plugin/substrate/distribution.ts serves a set of bundles. A stale stored bundle that the read-back parse would reject must not stop the rest of the set from publishing.

## Done when

A test stores an outdated bundle beside a valid bundle, runs the fan-out, and sees the valid bundle published.

## Evidence

Filled at landing: what ran and where its output is.
