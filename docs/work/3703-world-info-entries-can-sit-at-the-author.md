---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: world-info
plan: import-robustness
---

# World info entries can sit at the Author's Note and example-message edges

## What

A world info entry's position is only before or after the character (ENTRY_POSITIONS in packages/kit/src/world-info/index.ts) or an injection at a depth. SillyTavern also places entries at the top or bottom of the Author's Note and of the example messages. The app has both seats: a chat's Author's Note arrives as an injection in the chat's Injections section, and example messages are a preset section. An imported entry in one of those SillyTavern positions is placed before or after the character instead and named in the report.

## Why

A SillyTavern lorebook that relies on those positions changes its prompt order on import, though the app already has the seats it needs.

## Done when

An entry can be placed at the top or bottom of the Author's Note injection and of the example-messages section; a SillyTavern entry in those positions imports into them and exports back unchanged; assembly puts each in its seat with a test per position; the wiki's Coming from SillyTavern page states it.

## Evidence

Filled at landing: what ran and where its output is.
