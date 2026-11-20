---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# The Flat and Layered elevation previews show what each setting changes

## What

In Appearance, the preview diagrams for the Flat and Layered elevation settings read as empty bars, so a user picking an elevation sees nothing that tells the settings apart; only the Lifted diagram shows its effect.

## Why

A setting whose preview shows nothing cannot be chosen by sight.

## Done when

Each elevation preview shows the surfaces that setting changes, per the surface table in the interaction law, checked on light and dark themes with a component test.

## Evidence

Filled at landing: what ran and where its output is.
