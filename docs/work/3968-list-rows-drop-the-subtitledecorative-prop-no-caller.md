---
kind: work
status: doing
updated: 2026-11-24
priority: P3
area: ui
lane: wt/agent-afca5223c7596f5fc
plan: unwired-code
---

# List rows drop the subtitleDecorative prop no caller passes

## What

ListRowPropsBase.subtitleDecorative in packages/ui/src/primitives/list-row/list-row\.tsx defaults to false and no caller passes it, so the aria-hidden subtitle branch in list-row parts never runs.

## Why

An accessibility branch no caller can reach is untested surface that looks supported.

## Done when

The prop, its parts plumbing and the aria-hidden branch are gone, the character-facet-row comment that describes the rule is corrected, and the list row tests still pass.

## Evidence

Filled at landing: what ran and where its output is.
