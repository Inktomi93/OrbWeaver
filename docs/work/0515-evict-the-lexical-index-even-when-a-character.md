---
kind: bug
status: open
updated: 2026-10-03
priority: P3
area: search
---

# Evict the lexical index even when a character verb's audit rejects

## What

Eight character verbs (create, update, duplicate, restore, snapshot, attach-imported-art and the bulk verbs) emit charactersChanged after the audit, so a rejecting audit skips the lexical-index eviction. remove.ts was fixed with a finally in the 0493 audit lane.

## Why

A rejected audit leaves stale search rows for up to the 5-minute index TTL. create.ts carries a ruling that emits follow the audit; that ruling needs re-reading before the order changes.

## Done when

Every character verb evicts the lexical index whether or not its audit rejects, or the create.ts ruling is restated with why the TTL is acceptable; a rejecting-audit test per verb family.

## Evidence

Filled at landing: what ran and where its output is.
