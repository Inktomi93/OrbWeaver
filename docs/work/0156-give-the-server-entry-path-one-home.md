---
kind: work
status: open
updated: 2026-09-24
priority: P3
area: tooling
---

# Give the server entry path one home

## What

The server entry path is spelled in three places: stack/lib/spawn-plan.ts SERVER_ENTRY_REL, render-trace/ops/fire.ts and dev/ops/dev.ts SERVER_ENTRY_IN_PACKAGE.

## Why

A second copy of a shape is a defect; a moved entry breaks whichever copy nobody updated.

## Done when

One \_shared constant (with its law row) that all three import, and a test that the path exists.

## Evidence

Filled at landing: what ran and where its output is.
