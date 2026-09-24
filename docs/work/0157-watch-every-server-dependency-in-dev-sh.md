---
kind: bug
status: open
updated: 2026-09-24
priority: P3
area: tooling
---

# Watch every server dependency in dev.sh

## What

tooling/src/stack/dev.sh's watch list misses the inference, default-content and showcase-plugins packages, so an edit there does not restart the dev server under pnpm stack. pnpm dev derives the list from package.json.

## Why

A stale dev server hides edits and wastes debugging time.

## Done when

dev.sh watches the same package set pnpm dev derives, ideally from the same function, with a test.

## Evidence

Filled at landing: what ran and where its output is.
