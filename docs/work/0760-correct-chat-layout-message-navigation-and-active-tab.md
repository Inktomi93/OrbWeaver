---
kind: bug
status: open
updated: 2026-10-07
priority: P2
area: ui
---

# Correct chat layout, message navigation and active tab visuals

## What

Match the composer to the supplied two-row reference. Correct message header alignment, mobile avatar clipping, Game tab active styling, and variant swipe controls. Remove redundant preset rack active labels.

## Why

The rendered chat and wiki captures show inconsistent alignment, clipped avatars, misleading active icons, and unclear variant navigation.

## Done when

Verify desktop and mobile chat layouts, composer actions, variant generation and selection, and exclusive active tab styling. Keep one accessible preset active indication. Complete independent rendered review and replace affected wiki captures.

## Evidence

Implementation is integrated at `0a0de93fac7b2980dbd521732f8683d01e758faf` from `6bfd980928666503ea631857be37016e4a813dad`. Independent source and rendered reviews cleared the required corrections. The composer, message alignment, avatar clearance, active tab styling and variant controls passed scoped acceptance. Wiki screenshot replacement and combined product verification remain required.
