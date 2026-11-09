---
kind: work
status: doing
updated: 2026-11-09
priority: P3
area: ui
lane: wt/agent-a9bacfb72c2c0d9ff
plan: cross-surface-consistency
---

# EmptyState actions wrap at enlarged text

## What

The Presets welcome fix gave one EmptyState action the Button wrap prop. The other EmptyState sites with a Button action keep a no-wrap label that overflows its pane at 300% text the same way.

## Why

A fix at one site leaves the same overflow at every other site of the shared primitive.

## Done when

EmptyState owns its action's wrapping, so every action wraps at enlarged text without a per-site prop, with a CT at 300% on the phone over more than one EmptyState surface.

## Evidence

Filled at landing: what ran and where its output is.
