---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: client
---

# Adopt ModelPicker in the connection editor's model field

## What

The connection editor's ModelField still uses its own model input. It should use the shared ModelPicker, show the modelListed sentence, and offer a re-check action.

## Why

One picker everywhere; the editor currently cannot tell the user whether the saved model is still listed.

## Done when

ModelField renders ModelPicker with the saved model, the listed/not-listed sentence and a re-check that re-reads the catalog; CT covers listed, unlisted and failed catalog.

## Evidence

Filled at landing: what ran and where its output is.
