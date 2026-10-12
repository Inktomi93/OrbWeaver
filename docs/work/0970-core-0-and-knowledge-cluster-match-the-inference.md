---
kind: work
status: open
updated: 2026-10-12
priority: P2
plan: inference-flow
---

# Core-0 and Knowledge-Cluster match the inference and vector code

## What

Rewrite the Core-0 section 6 connection and role rows to match Tier-3b (a user table; no resolveRole). In Knowledge-Cluster, name the vector-table set once with one definition (Tier-1 and Knowledge-Cluster disagree on the count), and name the hand-off restamp and the clear, space-state and image-analysis deletes as exceptions or move them into the persistence home. Name an owning domain and a persistence factory for the agent session table. State in Tier-3b that the connection port reads by id and the runtime checks the owner. Delete the stale roleClientsFor JSDoc in compose/services.ts.

## Why

The docs describe a design the code replaced; a cold author following them builds the wrong thing.

## Done when

Each listed section matches the code; the vector writes have one stated home or named exceptions; the session table has an owner.

## Evidence

Filled at landing: what ran and where its output is.
