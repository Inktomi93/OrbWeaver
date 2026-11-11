---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# One notice composite owns callouts and status boxes

## What

Many sites build a toned Card with an icon, one line and an optional action by hand, with no owner for the shape. One notice composite owns it. Sites: survey table 3b for item 1766 under reports/cb-survey-1766, plus the two in rpg-veiled-section.tsx.

## Why

With no owner, tone and voice vary by site.

## Done when

A notice composite exists in the tier the law allows, every listed site uses it, and the census lists the cohort.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/features/preset/components/capability-gate.tsx:82` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-rack.tsx:111` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-rack.tsx:124` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/prompt-assembly/pivot-band.tsx:36` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/prompt-assembly/pivot-band.tsx:51` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/readout/readout-binding.tsx:38` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/readout/readout-parts.tsx:167` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/staleness-row.tsx:85` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/template-drill-in.tsx:400` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/prompt-assembly/section-body.tsx:170` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/preset/components/prompt-assembly/assembly-preview.tsx:86` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/chat/components/message-choices-block.tsx:58` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/chat/components/chat-controls-band.tsx:264` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/rpg/components/rpg-choice-echo.tsx:87` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/automation/components/rule-editor.tsx:62` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/automation/components/rule-editor.tsx:74` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/rpg/components/rpg-veiled-section.tsx:52` | Hand-spelled callouts and status boxes |
| `packages/client/src/features/rpg/components/rpg-veiled-section.tsx:119` | Hand-spelled callouts and status boxes |

## Evidence

Filled at landing: what ran and where its output is.
