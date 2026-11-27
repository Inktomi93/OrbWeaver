---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
---

# The connection editor's fact rows group related settings and point at their fix

## What

In the connection editor, the own-server opt-ins sit deep in a long fact list and the banned-phrase related rows are spread apart without referring to each other (connection-fact-model.ts); the paid-connection notice names settings no screen shows and offers no way to them (warning-notice.ts); and the fact list's value column is ragged with the new key the longest (connection-fact-rows.tsx).

## Why

An owner looking for why a setting did nothing cannot find the related rows or reach the fix from the notice.

## Done when

Related rows are grouped under one heading, the paid-connection notice names what was dropped in screen terms and links to it, the value column aligns, and a CT checks the grouping and the link.

## Evidence

Filled at landing: what ran and where its output is.
