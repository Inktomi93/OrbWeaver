---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# A phone swap between two list sections has no transition

## What

On a phone a list section with nothing selected shows its list as the screen and hides `.shell-content`, which is the only element with a view transition name. A swap between two such sections captures nothing and cuts. Home to a section fades because Home is content.

## Why

Section changes animate on some pairs and cut on others. The owner reported it from his phone.

## Done when

Every screen swap on a phone captures exactly one named region per side, whichever surface is the screen, and fades the same way. The content capture clause in `docs/law/UI-Architecture-and-Layout.md` states the rule. Reduced motion still shows no transition.

## Evidence

Filled at landing: what ran and where its output is.
