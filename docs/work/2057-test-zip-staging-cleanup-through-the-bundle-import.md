---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a70dd9d31997dbde4
plan: test-foundation
---

# Test zip staging cleanup through the bundle import route

## What

No case sends a hostile archive through the real bundle import route and then checks the staging folder. It needs a seam that lowers the decompressed size cap on that route, or an archive over the real cap.

## Why

Staging cleanup after a refused archive is the only bound on disk, and today it is proven below the route only.

## Done when

A hostile archive through the production route is refused and leaves the staging folder empty, with a defect control that goes red when the cleanup is removed.

## Evidence

Filled at landing: what ran and where its output is.
