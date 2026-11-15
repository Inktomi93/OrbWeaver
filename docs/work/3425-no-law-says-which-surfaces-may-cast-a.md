---
kind: decision
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# No law says which surfaces may cast a shadow or what each elevation setting does

## What

The law covers the shadow recipe and its theme-derived colours (D200) and rations glow per surface, but no line says when a surface may cast. The `glow` elevation setting puts the float recipe on every panel, a drop shadow on each surface root and a shadow on interactive cards. Select, combobox and autocomplete popups cast nothing while popover, menu and tooltip do. The command palette may carry two shadows. `docs/law/UI-Density-Law.md` names a Card `float` shape the code lacks, D159 describes `glow` incompletely, several shadows are hand-spelled, and the Icon drop shadow resolves to the framework default instead of the theme recipe. The Appearance copy does not describe what Lifted does.

## Why

Without the rule each surface decides alone, which produced the phone bar seam and the uneven popups, and a setting whose effect nobody wrote down.

## Done when

A law section states which surface kinds cast, which never do, and what flat, layered and lifted each change, checked against current major design systems. The stylesheets and primitives follow it, the popups share one float recipe, the drifted law lines are corrected, and the Appearance copy says what Lifted does. The owner has seen before and after pictures.

## Evidence

Filled at landing: what ran and where its output is.
