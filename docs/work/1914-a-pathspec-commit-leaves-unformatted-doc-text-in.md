---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# A pathspec commit leaves unformatted doc text in the index after the format hook

## What

With stage_fixed on format-docs, git commit with a pathspec commits the formatted text but leaves the unformatted text staged, so the next plain commit can undo the formatting.

## Why

The hook exists so nobody runs the formatter by hand, and this path silently reverses it.

## Done when

A pathspec commit of a doc leaves a clean status, shown by a probe in a planted repository.

## Evidence

Filled at landing: what ran and where its output is.
