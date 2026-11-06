---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: tooling
---

# Plugin author support generator's check mode is always red

## What

scripts/generate-plugin-author-support.ts --check compares unformatted output with the Biome-formatted file, so it always fails. Nothing runs it. Format before comparing, or remove the mode.

## Why

A check that is always red proves nothing and hides real drift.

## Done when

The check passes on a current generated file and fails on a stale one, or the mode is gone.

## Evidence

Filled at landing: what ran and where its output is.
