---
kind: bug
status: doing
updated: 2026-11-21
priority: P2
area: themes
lane: wt/agent-a88e9c3e95fd76027
plan: cross-surface-consistency
---

# Primary buttons show hover on a dark accent theme

## What

With a dark accent such as navy, primary buttons show no hover change, and the app logs a theme warning saying so.

## Why

Hover is the pointer user's sign that a button is live.

## Done when

The hover color derivation keeps a visible step on a dark accent under D71, with a rendered case for a dark accent seed.

## Evidence

Filled at landing: what ran and where its output is.
