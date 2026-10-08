---
kind: tooling
status: doing
updated: 2026-10-08
priority: P1
area: ci
lane: codex/select-hosted-evidence
---

# Route hosted Select diagnostics through an existing workflow

## What

Dispatch native controls and diagnostic captures from main through an existing registered workflow.

## Why

GitHub registers manual workflows only from the default branch.

## Done when

Selected-ref dispatch runs only diagnostics, preserves normal qualification and leaves release unchanged.

## Evidence

Filled at landing: what ran and where its output is.
