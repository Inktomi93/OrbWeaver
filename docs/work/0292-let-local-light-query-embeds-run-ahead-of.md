---
kind: bug
status: open
updated: 2026-09-30
priority: P3
area: inference
---

# Let local-light query embeds run ahead of indexer embeds

## What

Local-light runs every task on one worker thread in arrival order, so a search query embed issued during a sign-up seed waits behind the seed's card embeds: 8 s and 26 s in two measured runs.

## Why

A new user's first search right after sign-up stalls for seconds.

## Done when

Interactive query embeds take priority over indexer embeds, and a query embed during a sign-up seed returns in under 500 ms on a measured run.

## Evidence

Filled at landing: what ran and where its output is.
