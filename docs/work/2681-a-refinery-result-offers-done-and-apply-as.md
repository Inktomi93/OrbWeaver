---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# A Refinery result offers Done and Apply as two primary controls

## What

The density audit's second-primary check fails at refinery/execution/copy/result: "2 primary controls in Refinery content: Done | Apply 1 kept".

## Why

Two primary actions on one result compete; the user must pick which one finishes the step.

## Done when

One of the two is primary on a Refinery result, shown by a component test on the production surface that counts primary controls and is red today; or the reading is answered with a cited reason.

## Evidence

Filled at landing: what ran and where its output is.
