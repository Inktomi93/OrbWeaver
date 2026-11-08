---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Retire awaitAttaches from routeOrbSocket

## What

After the named-room migration, awaitAttaches remains at one workloads site counting 2 and five workloads sites counting 0.

## Why

A count of attaches can be met by the wrong room, which is the race 2199 fixed.

## Done when

Each remaining site waits on its named room or on served(), and the awaitAttaches option is removed.

## Evidence

Filled at landing: what ran and where its output is.
