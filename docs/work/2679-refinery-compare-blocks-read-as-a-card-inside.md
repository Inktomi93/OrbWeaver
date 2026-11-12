---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: cross-surface-consistency
---

# Refinery compare blocks read as a card inside a card

## What

The design audit rule nested-card fails at refinery/execution/analyze/result, refinery/execution/iterate/result and refinery/execution/rewrite/result on `[data-slot=compare-block-before]` and `[data-slot=compare-block-after]`, which sit inside the result card.

## Why

Nested bordered containers read as a flattened-design break; the earlier answers to this rule were audit false positives on specific shapes (iframes, pickers), and this shape has no answer yet.

## Done when

The compare blocks render as one container with the result, or the finding is answered with a cited reason and, if the audit is wrong, a fixture in the audit engine.

## Evidence

Filled at landing: what ran and where its output is.
