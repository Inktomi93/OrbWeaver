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

## Evidence

Filled at landing: what ran and where its output is.
