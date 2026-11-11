---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# Preset editor and appearance fields sit past their pane edge at the largest text on a phone

## What

Preset editor switches, inputs and the template textarea, appearance Background inputs and the character name-conflict dialog's fields paint past their pane (kinds K8, K9, K15). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

A field past the edge cannot be read or edited whole.

## Done when

The fields fit their pane in a component test at the phone width and the largest text, and the walk lists none.

## Evidence

Filled at landing: what ran and where its output is.
