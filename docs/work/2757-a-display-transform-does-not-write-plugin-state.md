---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: plugin
plan: authorization-and-visibility
---

# A display transform does not write plugin state

## What

`plugin.transformForDisplay` advances or resets a plugin's crash counter on every call, so a read changes state.

## Why

A query that writes is reachable wherever reads are, and it breaks the rule that queries write nothing.

## Done when

The crash counter moves only on a write path, or the transform is a mutation, with a test that a display transform leaves plugin state unchanged.

## Evidence

Filled at landing: what ran and where its output is.
