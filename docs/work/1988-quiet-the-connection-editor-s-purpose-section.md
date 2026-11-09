---
kind: work
status: open
updated: 2026-11-09
priority: P3
area: ui
plan: cross-surface-consistency
---

# Quiet the connection editor's Purpose section

## What

In `packages/client/src/features/credentials/components/connection-editor-purpose.tsx`, the guessed purpose shows a select labelled change and a chip for every role, most marked wrong kind. Show the guess as a sentence with a change action, and list only the roles the connection can serve.

## Why

Four negative chips say less than one line naming what the model is for.

## Done when

The section shows the guess and the servable roles only, and a CT pins a chat model and an embedding model.

## Evidence

Filled at landing: what ran and where its output is.
