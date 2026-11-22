---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: rpg
plan: unwired-code
---

# The RPG journal sets a custom type's label and changes an entry's type

## What

The journal tab's New entry composer sends type and title, and its editor patches title and content. rpgAddJournalEntryInputSchema.label and rpgEditJournalEntryInputSchema patch type and label are read by the server and sent by no control, so a custom-type entry has no label and no entry can change its type.

## Why

The tab shows stored labels and types that only the model can set.

## Done when

The composer sends a label for a custom type, the editor can change type and label, and a CT covers both; or the three inputs are removed.

## Evidence

Filled at landing: what ran and where its output is.
