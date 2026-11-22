---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: client
plan: unwired-code
---

# A document recall or search hit names its source span

## What

documentChunks.charStart and charEnd are written at ingest and never read.

## Why

Owner ruling : data collected and never shown is a product item. The span lets a hit point into the document.

## Done when

A databank hit carries its span and the client shows or opens the source passage, covered by a native application test.

## Evidence

Filled at landing: what ran and where its output is.
