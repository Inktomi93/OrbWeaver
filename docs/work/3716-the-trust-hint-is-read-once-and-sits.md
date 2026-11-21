---
kind: bug
status: open
updated: 2026-11-21
priority: P2
area: character
plan: cross-surface-consistency
---

# The trust hint is read once and sits below its field label in size

## What

On the character trust tab, screen readers read the hint twice and the hint text is larger than its field label.

## Why

Duplicate announcements and an inverted hierarchy make the field harder to use.

## Done when

The hint is announced once through the field's description and uses the hint text size, with a CT asserting the accessible description.

## Evidence

Filled at landing: what ran and where its output is.
