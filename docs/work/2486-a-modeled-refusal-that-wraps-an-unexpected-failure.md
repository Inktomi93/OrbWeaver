---
kind: work
status: doing
updated: 2026-11-11
priority: P3
area: server
lane: wt/agent-a06d7ca7c655446af
---

# A modeled refusal that wraps an unexpected failure still logs the cause

## What

When item 2475 turned extraction failures into client errors, a loader fault stopped appearing in any log, because a modeled domain error is not logged as unhandled. The fix there logs the cause where the loader error is wrapped. Other adapters and verbs wrap third-party or I/O failures in a modeled domain error the same way, and nobody has checked whether each still records its cause.

## Why

A dependency bump that breaks an adapter would show users a polite refusal and show the operator nothing.

## Done when

Each site under `packages/server/src` that catches an unknown error and rethrows a modeled domain error either logs the cause once or carries it to a boundary that does, shown by a list of the sites with what records each. Sites that record nothing are fixed, each with a test that reads the root's log ring.

## Evidence

Filled at landing: what ran and where its output is.
