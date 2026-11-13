---
kind: tooling
status: doing
updated: 2026-11-13
priority: P3
area: tests
lane: wt/agent-a9a004f98f3d7c671
plan: test-foundation
---

# The topbar rename case can fail on a focus steal, and the transport file drops its suppression

## What

The topbar case for renaming while the room mounts asserts a condition that is always true on a cold mount with no press, so a focus steal passes it. `packages/client/src/data/trpc.ts` holds a lint suppression for an explicit return type that exported types can state.

## Why

A case that cannot fail guards nothing, and a suppression for a real finding is a hatch.

## Done when

The case enters the room by a press at phone width with the room read held, asserts the rename field keeps focus, and has a control without the rename that lands focus in the room, red against a focus steal; and the suppression is replaced by the explicit type.

## Evidence

Filled at landing: what ran and where its output is.
