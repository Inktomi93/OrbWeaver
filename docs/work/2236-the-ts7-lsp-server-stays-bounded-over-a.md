---
kind: tooling
status: open
updated: 2026-11-08
priority: P2
area: tooling
---

# The ts7-lsp server stays bounded over a long session

## What

The TypeScript 7 language server started by .claude/marketplace/plugins/ts7-lsp/proxy.mjs grew to tens of GB of resident memory over a day or more of one session, on both accounts at once, and starved snap and the surface walk until browser targets crashed. The proxy never restarts or caps it.

## Why

One idle editor service took most of the box's memory and turned UI review runs into renderer crashes that read as product failures.

## Done when

The proxy restarts or caps the server so its resident memory stays under a stated bound over a long session, measured on a run long enough to have shown the growth, and the bound is recorded in the plugin header.

## Evidence

Filled at landing: what ran and where its output is.
