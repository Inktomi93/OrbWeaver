---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The generated theme does not slow Tailwind's first canonicalize call

## What

Tailwind's first canonicalizeCandidates call per design system takes about twenty seconds with the generated theme.css against under two seconds on the stock theme. Find the token namespace that drives the cold build.

## Why

The lint timeout bound hides a startup cost of tens of seconds on every lint thread.

## Done when

The cold call is under about five seconds, or the item records why it stays.

## Evidence

Filled at landing: what ran and where its output is.
