---
kind: bug
status: blocked
updated: 2026-11-07
priority: P2
area: ui
blocked: owner
plan: cross-surface-consistency
---

# Macro completion groups once and stays on screen

## What

Typing {{c in MacroTextarea repeats the card and identity headers and logs a React duplicate-key error for header-card and header-identity. On a phone the list hangs under the field behind the bottom bar: one row shows, and none with an emulated keyboard. Owners: packages/ui/src/primitives/macro-textarea/macro-textarea.tsx and listbox in packages/ui/src/primitives/macro-textarea/variants.ts. Findings F2 and F3 in the UI rendered review report under reports/ux-reviewer.

## Why

Repeated groups stop meaning anything and duplicate keys can drop rows. A touch user cannot pick a suggestion, which is the point of the list.

## Done when

Each group renders one header with no key error, because ranked rows are grouped once and not by a key change alone. The list anchors to the visual viewport and flips above the field when the space below is short, with rows visible under an emulated keyboard. A CT covers both, and the real-device check is recorded or filed.

## Evidence

Filled at landing: what ran and where its output is.
