---
kind: tooling
status: doing
updated: 2026-11-10
priority: P2
area: tooling
lane: wt/agent-a8de7b4cdde0d7872
plan: type-law
---

# orb/destructive-needs-confirm judges each control, not each file, so a second destructive control beside one confirm fails

## What

Make orb/destructive-needs-confirm judge each destructive control, not each file.

## Why

The rule passes a whole file when it holds one confirm, so a second destructive control beside that confirm goes unchecked.

## Done when

A fixture with two destructive controls and one confirm fails the rule on the unconfirmed control. A fixture where each control has its own confirm passes.

## Evidence

Filled at landing: what ran and where its output is.
