---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: ui
plan: cross-surface-consistency
---

# The lightbox and the immersive card dialog show a close control

## What

Both content dialogs in packages/ui (lightbox.tsx and immersive-card.tsx) open with no visible way out; only Escape and the backdrop close them. They live below the client composites, so they keep the raw primitive and each gains a visible close control. Ruling and sites: the class 1 table in the survey rulings for item 1766 under reports/cb-survey-1766.

## Why

The law requires every dialog to have a way out, and a phone has no Escape key.

## Done when

Both render a close control with an accessible name from a production copy module, and a component test closes each with it.

## Evidence

Filled at landing: what ran and where its output is.
