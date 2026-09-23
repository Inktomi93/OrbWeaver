---
kind: work
status: blocked
updated: 2026-09-23
priority: P2
area: server
blocked: owner
---

# Import SillyTavern Data Bank files and gallery images

## What

The SillyTavern profile import counts Data Bank files under `user/files/` and gallery images under
`user/images/` and reports them, but writes neither. See `countUserPlanes` in
`packages/server/src/domain/import/loader/collect.ts` and the report lines in
`packages/server/src/entry/import/import-report.ts`. Add the write steps: upload each Data Bank file
through the databank domain, and add each gallery image to its character's gallery through the assets
gallery verbs. Then change the report to show the written counts.

## Why

A user who imports a profile with Data Bank files or gallery images loses them. The staged corpus has
neither, so this waits until the owner stages a profile that has both.

## Done when

Importing a profile with Data Bank files and gallery images creates the databank documents and gallery
items. An integration test with a fixture profile proves both. The import report shows the written counts.

## Evidence

Filled at landing: what ran and where its output is.
