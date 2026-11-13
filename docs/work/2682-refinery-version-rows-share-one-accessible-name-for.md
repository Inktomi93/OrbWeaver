---
kind: bug
status: doing
updated: 2026-11-13
priority: P3
area: client
lane: wt/agent-a26edb67fcc42f1e4
plan: cross-surface-consistency
---

# Refinery version rows share one accessible name for Restore

## What

The names audit fails at refinery/execution/version-restored: two buttons named "Restore" under the Versions region of the Refinery details complementary, so a role-and-name lookup cannot pick one.

## Why

A screen-reader user cannot tell which version a Restore restores; the same defect class the Chat Context switch item records.

## Done when

Each version's Restore carries its version in its name from the shared naming home, and a production-mounted component test asserts the names differ.

## Evidence

Filled at landing: what ran and where its output is.
