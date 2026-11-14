---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# Files already in the library read as held everywhere an import reports

## What

The restore summary and the chat and card import dialogs now say when a file was already in the library. Four places still do not. A restore that partly fails writes lines that count a held file as imported. The import report gives a held file the Imported icon label. The SillyTavern folder import shows a held entry as skipped, which elsewhere means never attempted. The chat and card dialogs name a held file by its file name, because the import result carries no room title or card name.

## Why

The same outcome reads four different ways, and a reader who restores a backup cannot tell what was added from what was already there.

## Done when

Every import door and report shows a held file as held with one wording from the shared copy module, and the dialogs name the room or the card where the result can carry the name without a second shape.

## Evidence

Filled at landing: what ran and where its output is.
