---
kind: bug
status: open
updated: 2026-11-24
priority: P2
area: client
---

# The collection retry CT case answers regex.listUnattached

## What

config-collection-retry.ct.tsx ("one Retry recovers the Regex scripts") fails with unhandled procedures: regex.listUnattached; the procedure arrived with d5c7d6cb5b after the test's last edit, so the mounted responders no longer cover the collection's reads. It fails alone on a clean tree.

## Why

A red CT case on main hides any real regression in the collection retry path.

## Done when

The case answers the collection's reads through the testkit's corpus responders, passes alone and in its file, and a planted removal of the new procedure's responder turns it red.

## Evidence

Filled at landing: what ran and where its output is.
