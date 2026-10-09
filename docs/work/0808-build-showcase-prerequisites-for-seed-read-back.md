---
kind: bug
status: doing
updated: 2026-10-09
priority: P1
area: ci
lane: codex/seed-readback-prerequisite
---

# Build showcase prerequisites for seed read-back

## What

Build the release showcase bundles before the composed seed read-back test uses them.

## Why

A clean checkout has no runtime bundles. Test order can hide the missing prerequisite and leave plugin reads empty.

## Done when

The isolated seed read-back suite passes from an absent bundle directory. Exact showcase identities, disabled consent state, wire schemas and table census remain checked. Hosted application qualification passes.

## Evidence

The isolated test reproduces the missing bundle failure and passes after its own native build. Showcase consent, wire schemas and table coverage remain checked.

Normal scoped checks and independent review pass. Hosted application qualification remains pending.
