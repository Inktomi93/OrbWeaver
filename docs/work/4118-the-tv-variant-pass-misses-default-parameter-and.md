---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tooling
---

# The tv variant pass misses default-parameter and computed-boolean writes

## What

The unwired graph reports tv variant values as unwritten when the writer is a default parameter (list-row\.tsx titleQualifierFace mono, radio-group.tsx corners check), a computed boolean (meter.tsx danger) or a plugin image aspect (AspectFrame.aspect).

## Why

A false unwritten-variant row invites deleting styles the app renders.

## Done when

Red-first graph cases show each writer shape counting as a write, and the whole-tree run no longer reports those variant values.

## Evidence

Filled at landing: what ran and where its output is.
