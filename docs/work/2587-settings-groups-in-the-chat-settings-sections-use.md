---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: client
plan: cross-surface-consistency
---

# Settings groups in the chat settings sections use SettingRowGroup

## What

assembly-preview-panel.tsx, prose-settings-section.tsx and imagery-templates-section.tsx wrap settings rows in a Card.

## Why

The plan names SettingRowGroup as the home of settings rows.

## Done when

The listed files hold no Card around settings rows, and a rendered check reads each section.

## Sites

| Site | What it is |
| - | - |
| `packages/client/src/features/chat/components/assembly-preview-panel.tsx:146` | Chat settings groups |
| `packages/client/src/features/chat/components/assembly-preview-panel.tsx:269` | Chat settings groups |
| `packages/client/src/features/chat/components/prose-settings-section.tsx:171` | Chat settings groups |
| `packages/client/src/features/chat/components/imagery-templates-section.tsx:155` | Chat settings groups |

## Evidence

Filled at landing: what ran and where its output is.
