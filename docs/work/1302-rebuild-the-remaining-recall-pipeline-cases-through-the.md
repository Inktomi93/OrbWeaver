---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: inference
plan: restoration-register
---

# Rebuild the remaining recall pipeline cases through the composed root

## What

The 0991 case map defers these recall cases: mode off and empty pool without an embed, maxTier, the tiered bridge, the bridge-covered and mode-excluded verdicts, live-window boundary and straddle, fail-closed missing spans, shrink reclaim, recall phase events, surfaced counts, and the eval knob and floor controls (queryWindow, retrieveK, rerankTo, minScore, off-corpus query).

## Why

None has a maintained composed case, so a regression in the recall pipeline's verdicts or knobs ships unseen.

## Done when

Each case has a composed test through the server root with a defect control, and its 0991 case-map row flips to Rebuild.

## Evidence

Filled at landing: what ran and where its output is.
