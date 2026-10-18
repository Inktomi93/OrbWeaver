---
kind: bug
status: open
updated: 2026-10-18
priority: P2
area: server
plan: test-foundation
---

# assets-gc proves a blob unreferenced before deleting it

## What

Every box seeds an enabled weekly assets-gc schedule at boot (packages/server/src/entry/boot/seed-cas-schedules.ts). It deletes stored blobs it judges unreferenced. Audit every reference source the GC consults against every table and file that can hold a blob reference, and confirm a missed source fails closed rather than deleting live data.

## Why

A default-on weekly deletion that misses one reference kind silently destroys an owner's data.

## Done when

Each blob-referencing column and file is shown to be consulted by the GC, a planted reference of every kind survives a GC run on the real composition root, and an unknown reference shape makes the GC refuse rather than delete.

## Evidence

Filled at landing: what ran and where its output is.
