---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Corpus selected-context buttons keep their names inside the pane

## What

In the corpus selected-context tabs on a phone at 200% and 300% text, the cluster name buttons and the member name buttons in the Archetypes tab paint past the pane's right edge. The member buttons in `packages/client/src/features/discovery/components/corpus-archetypes-tab.tsx` carry no wrap and put a truncating label inside a button, although the comment above them says they wrap, and the cluster name buttons that do wrap are still cut.

## Why

A name cut at the pane edge cannot be read or pressed whole.

## Done when

A component test in `tests/client/features/discovery/components/` mounts the Archetypes tab with long model-authored names at 390px wide and with 200% and 300% text. It asserts that every name button lies inside the pane and shows its whole name. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
