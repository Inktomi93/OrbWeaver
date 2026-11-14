---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
plan: test-foundation
---

# The re-extract stamp case takes its mimes and its temp directory from their owners

## What

`tests/server/domain/databank/persistence/re-extract-stale-stamp.int.test.ts` types its mime strings by hand, because production exports no mime constants beside `docFormatForMime` in `packages/contracts/src/extraction/index.ts`. It also makes and removes its shared storage directory by hand; the testkit's owned temp directory has no door a case under `tests/server` can reach.

## Why

A mime renamed in the table leaves the case passing for the wrong reason, and a hand-made directory is left behind when a case fails before its cleanup.

## Done when

The case reads its mimes from an exported home and takes its directory from the testkit, or the testkit README states why a server case may make its own.

## Evidence

Filled at landing: what ran and where its output is.
