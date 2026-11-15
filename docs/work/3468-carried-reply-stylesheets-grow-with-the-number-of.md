---
kind: bug
status: doing
updated: 2026-11-15
priority: P2
area: chat
lane: wt/agent-ad2e7ecc51f3d5bc1
---

# Carried reply stylesheets grow with the number of runs times the total CSS

## What

Each run of a split framed reply carries every other run's style elements, so the minted frame documents grow with runs times total CSS. A reply with many splits and a large stylesheet exceeds the per-user frame handle store bound in `packages/server/src/entry/http/frame-handle-store.ts`, handles are evicted and runs fall back to the plain path.

## Why

A heavy preset in a room that splits replies on dice or choices can lose its frames, and each split multiplies the bytes minted and sent.

## Done when

The bytes minted for one reply are bounded by a stated rule that a preset-sized stylesheet with several splits stays under, behaviour over the bound is defined and tested, and a measurement of a large stylesheet across many runs is in the report.

## Evidence

Filled at landing: what ran and where its output is.
