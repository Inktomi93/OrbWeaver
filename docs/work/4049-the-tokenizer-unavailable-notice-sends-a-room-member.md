---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: chat
---

# The tokenizer-unavailable notice sends a room member to a Connections page that cannot fix the host's server

## What

When a banned phrase drops because the server's tokenizer is unavailable, the notice offers Connections to every room member (turn-warning-surface.ts), but only the host's connection drives the turn, so a member's own Connections page cannot fix it.

## Why

A member follows a fix that does nothing.

## Done when

The Connections door shows only to the viewer whose connection ran the turn, a member sees the notice without it, and a CT covers both viewers.

## Evidence

Filled at landing: what ran and where its output is.
