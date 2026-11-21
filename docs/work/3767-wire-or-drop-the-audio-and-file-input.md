---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: inference
plan: unwired-code
---

# Wire or drop the audio and file input modalities

## What

packages/contracts/src/inference/capability/generation.ts:339: audio and file input modalities are captured on capability rows and no chat turn sends them.

## Why

Captured capability that nothing acts on reads as support.

## Done when

The turn sends audio and file parts where the capability states them, with a test, or the two members leave the modality tuple with the reason.

## Evidence

Filled at landing: what ran and where its output is.
