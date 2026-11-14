---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# The chat export writes its message times as ISO instants, not a zone-less wall clock

## What

The chat export writes `send_date` and `create_date` through `formatStDate` in `packages/server/src/primitives/serde/chat/index.ts`: the humanised am/pm form, a UTC wall clock with no zone and minute precision. The stored instant is UTC and the export is right to write UTC, but that form does not say so: SillyTavern reads a zone-less date in its own host's zone, so a host outside UTC shows the times shifted, and the seconds are lost. Current SillyTavern writes these fields with `toISOString()`. Write the ISO form with its `Z`, which states UTC and keeps the instant.

## Why

An export must carry the instant the server stores. A zone-less form leaves the reader to guess the zone.

## Done when

The chat export writes ISO instants with `Z` for both fields, an export then import round trip returns the same instants to the millisecond, and the import still reads every older form.

## Evidence

Filled at landing: what ran and where its output is.
