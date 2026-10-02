---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: refinery
---

# Make manual refinery field extraction exhaustive

## What

Type manualTextOf from the canonical refinable field union excluding greetings. Replace the empty fallback with exhaustive handling.

## Why

The current string parameter admits unsupported fields and converts them to empty text. The production caller already supplies the narrower field type.

## Done when

A missing supported field fails type checking. Existing field extraction and manual-target tests pass without changing greeting handling.

## Evidence

Source review: `/tmp/claude-launch-registry-audit/results.json`, group `manual-text-of-field-type`. Main checked the cited definitions and consumers. Implementation and affected checks remain pending.
