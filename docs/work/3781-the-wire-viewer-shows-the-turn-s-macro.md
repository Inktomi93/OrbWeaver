---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: chat-html-and-presets
---

# The wire viewer shows the turn's macro record

## What

getVariantWire serves VariantWireView\.macros, the slice the turn stored of which user macros it registered, which lost a name and to which home, and which plugin macros were deferred. variant-wire-viewer.tsx shows none of it; only tests read it.

## Why

A host cannot see why a macro rendered another home's value on a given turn.

## Done when

The wire viewer has a macros section listing registered, shadowed and deferred macros with their homes, absent when the turn stored none, and a CT covers a turn with a shadowed macro.

## Evidence

Filled at landing: what ran and where its output is.
