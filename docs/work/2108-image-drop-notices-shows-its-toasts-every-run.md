---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a255419bb88fd5e35
plan: test-foundation
---

# image-drop-notices shows its toasts every run

## What

The image-drop-notices CT sometimes shows zero toasts, on main as well, about one run in five.

## Why

A flake trains everyone to rerun instead of read.

## Done when

The cause is named and fixed, and the file passes repeated runs.

## Evidence

Filled at landing: what ran and where its output is.
