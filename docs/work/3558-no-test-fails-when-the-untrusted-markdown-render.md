---
kind: work
status: open
updated: 2026-11-16
priority: P3
area: ui
plan: chat-html-and-presets
---

# No test fails when the untrusted Markdown render stops stripping raw-text elements

## What

The untrusted Markdown render strips style, script and text elements before it unwraps disallowed markup. Removing the strip leaves the styled reply and greeting component suites green; the member card viewer, reasoning trace and corpus moments rely on it alone.

## Why

The plain-path fix has no guard at the layer that applies it.

## Done when

A component test renders untrusted Markdown holding a style element inside a block and a textarea, and goes red with the strip removed.

## Evidence

Filled at landing: what ran and where its output is.
