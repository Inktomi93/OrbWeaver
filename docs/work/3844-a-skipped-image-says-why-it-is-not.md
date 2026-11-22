---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: client
plan: unwired-code
---

# A skipped image says why it is not searchable

## What

image_index_skips records reason, width, height and created_at; the only read checks presence.

## Why

Owner ruling : data collected and never shown is a product item. A person cannot tell why an image never appears in search.

## Done when

The image or index status surface shows each skipped image with its reason and measured size, through a production read, covered by a native application test.

## Evidence

Filled at landing: what ran and where its output is.
