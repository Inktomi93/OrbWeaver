---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: ui
---

# MutedLine keeps a caller's data-slot

## What

MutedLine sets its own data-slot after spreading the caller's props, so a caller's data-slot is silently overridden.

## Why

A primitive that drops a caller's slot breaks the selectors and styles keyed on it without a signal.

## Done when

A caller's data-slot reaches the DOM, or the primitive's type refuses the prop, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
