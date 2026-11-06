---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Census and migrate-owner gaps found by the owner migrations

## What

The census cannot see classes held in constants. migrate-owner cannot plan variant-prefixed tokens. A move leaves cn(X) and a dead import behind.

## Why

Hand-written classes in constants stay invisible, prefixed tokens need hand moves, and each leftover needs a hand cleanup.

## Done when

A class in a constant shows in the census, a prefixed token plans or refuses by name, and a move leaves no single-argument cn or dead import.

## Evidence

Filled at landing: what ran and where its output is.
