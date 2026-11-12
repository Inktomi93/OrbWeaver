---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# The remaining host-named work is traced for a disabled account

## What

Chat-scoped plugin automation, rpg rounds started outside a turn, and the search, discovery and databank reads that run as the host check presence only. None was traced end to end when the turn paths were gated.

## Why

Each is a way work can run in a disabled account's name, and nobody has shown whether it spends that account's inference.

## Done when

Each path is traced and either reads the room's present and enabled set with a test, or is recorded in its file header as not spending the host's account.

## Evidence

Filled at landing: what ran and where its output is.
