---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Expandable and stateful sub-entity rows use the row owner, not a Card

## What

Collapsible sub-entity rows are built from Card in rule-row\.tsx, injections-manager.tsx, room-overrides-form.tsx, plugin-row\.tsx, rpg-journal-tab.tsx and the refinery context tabs, and rpg-pack-rows.tsx holds an interactive Card in a feature list. The row owner gains an expandable body and a state rail once and each site uses it. Sites: the class 3 table in the survey rulings for item 1766 under reports/cb-survey-1766.

## Why

The law names ListRow for a row and calls an interactive Card the anti-pattern.

## Done when

The row owner has an expandable body and a state rail with component tests, each listed site uses it, and no feature list holds an interactive Card.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/features/automation/components/rule-row.tsx:248` | Collapsible sub-entity rows |
| `packages/client/src/features/chat/components/injections-manager.tsx:177` | Collapsible sub-entity rows |
| `packages/client/src/features/chat/components/room-overrides-form.tsx:81` | Collapsible sub-entity rows |
| `packages/client/src/features/plugin/components/plugin-row.tsx:133` | Collapsible sub-entity rows |
| `packages/client/src/features/rpg/components/rpg-journal-tab.tsx:264` | Collapsible sub-entity rows |
| `packages/client/src/features/refinery/components/context-tabs.tsx:109` | Collapsible sub-entity rows |
| `packages/client/src/features/refinery/components/context-tabs.tsx:215` | Collapsible sub-entity rows |
| `packages/client/src/features/refinery/components/context-tabs.tsx:363` | Collapsible sub-entity rows |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx:160` | Interactive pack-row cards |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx:175` | Interactive pack-row cards |
| `packages/client/src/features/rpg/components/rpg-pack-rows.tsx:237` | Interactive pack-row cards |

## Evidence

Filled at landing: what ran and where its output is.
