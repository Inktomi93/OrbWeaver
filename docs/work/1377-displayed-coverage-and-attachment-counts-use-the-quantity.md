---
kind: bug
status: doing
updated: 2026-10-27
priority: P2
area: client
lane: snap_defaults
---

# Displayed coverage and attachment counts use the quantity their labels name

## What

Correct the Corpus grouped-character headline and World Info attached-persona heading. The former uses total library population; the latter uses available personas.

## Why

The rendered labels overstate grouped or attached populations. These are readout defects, not evidence of persistence failures.

## Done when

Each label matches its actual population. Tests use different available and grouped or attached populations, including zero attachments. Preserve stored values.

## Case decisions

| Behavior | Layer and decision |
| - | - |
| Grouped-character headline differs from whole-library population | Add a production-mounted Corpus readout CT with distinct valid populations. This does not test the grouping algorithm. |
| Attached persona count differs from available personas, including zero attachments | Add a production World Info Context CT using production-derived data. |
| Attachment persistence and ownership | Keep maintained corpus library integration coverage. |

## Evidence

Filled at landing: what ran and where its output is.
