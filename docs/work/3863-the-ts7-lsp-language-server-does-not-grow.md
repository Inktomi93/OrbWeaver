---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
---

# The ts7-lsp language server does not grow without bound

## What

The tsc --lsp --stdio process behind the ts7-lsp mod (.claude/marketplace/plugins/ts7-lsp) reached 22 GB resident after about five hours in one session and had to be killed by hand, the second time in a day.

## Why

One editor-tooling process takes a sixth of the box's memory and starves test and scan runs.

## Done when

The mod restarts or recycles its server past a memory ceiling or idle time, or the leak is traced to a request pattern and fixed, and a long session stays under the ceiling.

## Evidence

Filled at landing: what ran and where its output is.
