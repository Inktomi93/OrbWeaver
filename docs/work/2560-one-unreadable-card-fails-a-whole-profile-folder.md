---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: import
plan: import-robustness
---

# One unreadable card fails a whole profile-folder import

## What

The profile-folder import collects cards with no per-card error handling (packages/server/src/domain/import, the collect step that calls the card PNG parser). A card the parser throws on fails the whole import workload with zero characters imported, the good cards beside it included. The single-card import path answers a coded invalid-card refusal for the same file. Found while probing a regression on the JSON column branch; the weakness is on main. Source: the second code review of that branch under reports/code-reviewer.

## Why

A person importing a SillyTavern folder with one damaged card gets nothing and no word on which file was at fault.

## Done when

A card the parser refuses or throws on is recorded as a failed file with the coded reason and the import continues; the import report names it. A test imports a folder holding a good card and an unreadable one through the production workload and asserts one imported, one named failure.

## Evidence

Filled at landing: what ran and where its output is.
