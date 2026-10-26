---
kind: bug
status: open
updated: 2026-10-26
priority: P2
area: client
---

# Displayed coverage and attachment counts use the quantity their labels name

## What

Correct the Corpus grouped-character headline and World Info attached-persona heading. The former uses total library population; the latter uses available personas.

## Why

The rendered labels overstate grouped or attached populations. These are readout defects, not evidence of persistence failures.

## Done when

Each label matches its actual population. Tests use different available and grouped or attached populations, including zero attachments. Preserve stored values.

## Evidence

Filled at landing: what ran and where its output is.
