---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: client
plan: cross-surface-consistency
---

# First-ever open of the New chat picker holds the roster door row

## What

A device with no remembered box for the New chat picker grows by the roster door row once, for a user with saved rosters, because the declared box excludes the row.

## Why

A dialog that jumps on first open reads as broken.

## Done when

The declared box includes the row or a CT seeds the box store, and first open holds its height.

## Evidence

Filled at landing: what ran and where its output is.
