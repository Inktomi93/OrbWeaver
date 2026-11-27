---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
---

# Unions verb counts a value typed by another tuple as building a tuple's members

## What

LOG_LINE_LEVELS in packages/ui/src/primitives/log-viewer/log-viewer.tsx is built only by PLUGIN_LOG_LEVELS values riding into LogLine.level from plugin-log-panel.tsx; @orb/ui cannot import contracts, so the two tuples are legitimate, but the unions verb reports the ui members as never built.

## Why

A false unbuilt-member row invites deleting log levels the plugin panel shows.

## Done when

A red-first unions case shows a value typed by another tuple building the slot tuple's members, and a value typed by the slot's own tuple still builds nothing.

## Evidence

Filled at landing: what ran and where its output is.
