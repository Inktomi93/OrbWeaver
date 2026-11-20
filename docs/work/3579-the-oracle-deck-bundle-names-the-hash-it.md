---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: plugin
---

# The Oracle Deck bundle names the hash it implements

## What

`bundles/oracle-deck/main.ts:15` says FNV-1a. The code is a base-31 polynomial hash mod 2^31-1 (`HASH_MULTIPLIER = 31`, `:90,101`). The bundle README says FNV-class at `:111` and still invites a recompute at `:58-59`. Rename the algorithm in both files so a recompute implements the real one.

## Why

A player who takes the invite and implements FNV-1a fails the fairness check against a correct deck.

## Done when

The header and the README name the same algorithm the code runs, with its constants, and the recompute instructions reproduce a deck.

## Evidence

Filled at landing: what ran and where its output is.
