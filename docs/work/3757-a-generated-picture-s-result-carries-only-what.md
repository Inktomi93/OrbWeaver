---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: imagery
plan: unwired-code
---

# A generated picture's result carries only what its callers read

## What

GeneratedPicture (packages/contracts/src/imagery/index.ts) carries prompt, promptSource, mode, model and costUsd. Its callers (the chat generateImage verb, the model's image tool and editImage) read only images, reused and warnings; the provenance row written at generation holds the other facts and the lightbox reads them there.

## Why

A result that repeats facts its provenance row owns gives one fact two homes.

## Done when

GeneratedPicture holds images, reused and warnings; its schema and every producer follow; the provenance row and the lightbox strip are unchanged; imagery and chat image tests pass.

## Evidence

Filled at landing: what ran and where its output is.
