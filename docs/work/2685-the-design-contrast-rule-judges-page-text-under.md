---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: surface-walk
---

# The design contrast rule judges page text under a modal scrim

## What

At every confirm dialog checkpoint the contrast rule reports page elements outside the dialog at ratios far below the page's own, and several rules report the covered population as withheld. Evidence: the desktop evidence walk report under reports/cb-walk-evidence.

## Why

Text a scrim dims on purpose is reported as a contrast failure on every dialog, which hides a real one.

## Done when

The audit either judges the page as the scrim paints it or withholds it under a named reason, a fixture with a dialog scrim over compliant text reports nothing, and a control with real low contrast under a scrim still reports.

## Evidence

Filled at landing: what ran and where its output is.
