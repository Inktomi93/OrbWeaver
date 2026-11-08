---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: ui
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# Picker search inputs use the field type size on touch

## What

The command input uses text-body, 15px, at a coarse pointer (packages/ui/src/primitives/command/variants.ts), so iOS zooms the page on every New chat open, every picker and the command palette. Use the field type token.

## Why

A zoom on every picker open moves the dialog off screen on a phone.

## Done when

Every command and picker search input renders at the field size or larger at a coarse pointer, with a CT that reads the computed font size. Source: acceptance part 1 report.

## Evidence

Filled at landing: what ran and where its output is.
