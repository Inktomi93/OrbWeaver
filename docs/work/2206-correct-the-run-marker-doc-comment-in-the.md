---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Correct the run-marker doc comment in the platform probe

## What

The doc comment at tooling/src/floor/host/platform.ts near the run-marker sweep describes the old behaviour for a process the sweep cannot read.

## Why

A reader trusts the comment and misjudges what the sweep skips.

## Done when

The comment states the skip-and-refuse rule the code applies.

## Evidence

Filled at landing: what ran and where its output is.
