---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Landscape keyboard composer test reads a zero box under display contents

## What

tests/client/features/chat/components/composer-two-rows.ct.tsx fails on main in both landscape keyboard cases with a row overlap. Find whether the composer rows overlap on screen, or whether the test measures a display contents box that reports zero.

## Why

A red test on main hides a real regression if one lands in the same place, and the keyboard layout is a phone reading path.

## Done when

The cause is named, and the test passes against a real measurement of the rendered rows.

## Evidence

Filled at landing: what ran and where its output is.
