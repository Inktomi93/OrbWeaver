---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: imagery
lane: wt/agent-adb68c6b9e2624d09
plan: unwired-code
---

# An image edit can use another picture as its reference

## What

ImageEditInput.references (packages/inference/src/contract/roles.ts) is read by the Google and OpenAI-compatible image backends, and no router input, verb or screen supplies it.

## Why

Editing or redrawing a picture against the character's avatar or a gallery picture keeps their look consistent.

## Done when

The image edit dialog can attach the character's avatar or a gallery picture as a reference, the imagery contract and edit verb carry it, and a backend test and a CT cover an edit with one reference.

## Evidence

Filled at landing: what ran and where its output is.
