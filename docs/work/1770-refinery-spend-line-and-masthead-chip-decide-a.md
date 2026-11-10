---
kind: work
status: doing
updated: 2026-11-10
priority: P3
area: client
lane: wt/agent-a0155baee3755cb7f
plan: cross-surface-consistency
---

# Refinery spend line and masthead chip: decide a money line; raw wire words in chips get a checker column

## What

Decide whether Refinery shows a money line before a run, and what it says. Add a ui-facts checker column that flags raw wire words in chips.

## Why

Refinery states cost only after a run, in the Runs ledger, and no house convention for a spend statement exists. Some chips print the wire spelling of a value, such as ACCEPT, where the list prints a word.

## Done when

The decision on the money line is recorded, built or declined with a reason. A pnpm ui-facts column lists chips fed by a raw wire value, with a planted control that it flags.

## Evidence

Filled at landing: what ran and where its output is.
