---
kind: work
status: open
updated: 2026-10-03
priority: P3
area: docs
---

# Repoint the remaining D44 section cites to the theming law

## What

D44 §12.x cites remain in docs/law/ui-package-design.md, packages/ui/src/tokens/tokens.json and other files. The 0493 lane repointed only the D294 cites to docs/law/UI-Theming-and-Content.md §12.x.

## Why

A cite to a superseded ledger row sends a reader to the wrong law.

## Done when

rg 'D44 §12' returns no hits outside the ledger itself, and each repointed cite names the current section.

## Evidence

Filled at landing: what ran and where its output is.
