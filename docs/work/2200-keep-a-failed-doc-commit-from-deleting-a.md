---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Keep a failed doc commit from deleting a file the snapshot never saw

## What

putBack in tooling/src/doc/ops/tree.ts deletes a written path that the pre-run snapshot did not hold, because a missing entry reads as absent.

## Why

A future verb that writes outside the tracked text files would lose that file when its commit fails.

## Done when

putBack refuses or keeps a written path the snapshot never saw, with a test that writes one and fails the commit.

## Evidence

Filled at landing: what ran and where its output is.
