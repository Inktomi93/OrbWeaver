---
kind: tooling
status: open
updated: 2026-11-06
priority: P2
area: tooling
---

# Knip and doc format report reds on main outside recent work

## What

pnpm knip reports requireWiredHost and HeldThenFailing, and pnpm doc format --check reports items 1776, 1819, 1839 and 1844. Clear each at its owner.

## Why

Pre-push and CI run these checks, so a standing red blocks the next push.

## Done when

Both commands exit clean on main.

## Evidence

Filled at landing: what ran and where its output is.
