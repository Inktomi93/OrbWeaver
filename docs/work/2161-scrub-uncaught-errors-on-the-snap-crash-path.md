---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: tooling
plan: snap-secret-hygiene
---

# Scrub uncaught errors on the snap crash path

## What

The uncaughtException and unhandledRejection handlers in tooling/src/floor/cli/run-tool.ts print the raw stack. The snap wrapper covers only the awaited throw.

## Why

A planted async throw printed a base URL token raw to the terminal.

## Done when

runTool takes an optional error-scrub hook that crashExit applies, proved by a red-first async plant.

## Evidence

Filled at landing: what ran and where its output is.
