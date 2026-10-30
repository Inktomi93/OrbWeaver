---
kind: tooling
status: open
updated: 2026-10-30
priority: P2
area: testing
plan: surface-walk
---

# Decide and wire Lighthouse timespans and Snap cascade analysis into the surface walkthrough, or rule them out

## What

Codex told the owner it would reuse Snap's Lighthouse adapter and the --cascade winning-rule analysis inside the E2E walkthrough if they could be wired through supported APIs with clean lifecycle. Neither was wired; the Lighthouse adapter needs a published debugging port the Playwright fixture lacks.

## Why

The owner wants one E2E command with no detours to Snap; an open promise with no item gets forgotten.

## Done when

Each is wired behind the surface command with native lifecycle and its findings appear in the agent entry, or the plan records why it is excluded with the evidence.

## Evidence

Filled at landing: what ran and where its output is.
