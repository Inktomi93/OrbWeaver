---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: ui
---

# Toasts float over content instead of pushing it down

## What

The shell mounts the toast band in normal flow (ui toast variants.ts placement band, client app-toaster.tsx, shell.css notice band), so every toast shifts the content below it 23 to 46 px (Characters import, Chats import, Presets Activate). Owner ruling: toasts move to an overlay. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

A toast never moves page content, on every surface, with a test.

## Evidence

Filled at landing: what ran and where its output is.
