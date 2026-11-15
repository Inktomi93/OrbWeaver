---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: server
---

# The frame handle store is sized for unsplit replies and a few split replies fill a viewer's share

## What

`packages/server/src/entry/http/frame-handle-store.ts` sizes its per-user and process ceilings from one stored document per framed reply. A framed reply that splits on dice, choices or media mints one document per run, and each run now carries the reply's other stylesheets. A handful of heavily split preset replies on one screen fill a viewer's byte ceiling, the oldest documents are evicted and their frames mint again.

## Why

A reader in a room that splits replies often would see frames reload or fall back while scrolling, and each eviction costs a mint.

## Done when

The ceilings are set from a measurement of a preset-sized transcript with split replies, recorded in the store's header beside the existing sizing, with the per-account and process memory an abuser can pin stated. A test drives a screen of split replies through the mint route and sees no eviction. A security-builder review confirms the new bound.

## Evidence

Filled at landing: what ran and where its output is.
