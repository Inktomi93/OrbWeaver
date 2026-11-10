---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# Rail sections and theme fields stop sharing names with data and nav rows

## What

The rail's Databank button shares its name with the preset prompt-order block named Databank and with a chat-behavior config row; the theme builder's Appearance list row Background shares its name with the Background colour field.

## Why

Controls that go to different places under one name read as one door; a prompt block or field named after a section needs a qualifier that says what it is.

## Done when

Each colliding control carries a qualifier from its own naming home (a block, a field, a section), any row that navigates to the section is checked and either reuses the rail door or is renamed, and the duplicate-action-door findings for these names are gone from the evidence cases.

## Evidence

Filled at landing: what ran and where its output is.
