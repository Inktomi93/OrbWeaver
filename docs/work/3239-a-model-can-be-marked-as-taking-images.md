---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: credentials
---

# A model can be marked as taking images when it is added

## What

A user who routes several providers through one endpoint under a custom model name gets no image input, because nothing reports that the model takes images. The capability override already carries the fact: `generation.input` in `packages/contracts/src/inference/capability/override.ts`, shown as the list row named takes in `packages/client/src/features/credentials/lib/connection-capability-fact-model.ts`. It sits among the advanced facts as a free list, and the add flow never asks.

## Why

A custom or local vision model is common, and a user expects one plain switch when adding it. A buried list field reads as the feature being absent.

## Done when

The add-model step and the connection editor show one plain switch for image input when the model's inputs are assumed or unreported, it writes the same override fact, and a case proves a turn on that connection sends an attached image to a model the provider reported nothing about, with a control where the switch is off and the image is withheld with its reason shown.

## Evidence

Filled at landing: what ran and where its output is.
