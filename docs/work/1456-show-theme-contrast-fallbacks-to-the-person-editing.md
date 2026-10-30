---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Show theme contrast fallbacks to the person editing the theme

## What

ThemeScope reports a tone fallback and an input-border fallback when a custom background cannot hold a D336 or D159 bound. Both reporters log to the console in development only (packages/client/src/features/app-shell/lib/tone-fallback-log.ts), so the person who picked the background never learns that a bound was relaxed.

## Why

No hidden magic: when the app relaxes a contrast bound the user's own choice caused, the theme editor says so. About 90 of the 2060 accepted-base matrix points report an input-border fallback.

## Done when

The theme editor shows a warning naming the relaxed bound for the theme being edited, driven by the same reports, with a CT over a reporting and a non-reporting base.

## Evidence

Filled at landing: what ran and where its output is.
