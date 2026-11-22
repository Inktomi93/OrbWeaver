---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: chat
plan: unwired-code
---

# An invite row shows when the invite was made

## What

inviteView createdAt is written and the invite dialog row never reads it.

## Why

Two invites with the same limits cannot be told apart.

## Done when

The invite row shows its age and a component test covers it.

## Evidence

Filled at landing: what ran and where its output is.
