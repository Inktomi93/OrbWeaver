---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: inference
plan: typed-enforcers
---

# The provider turn log's terminal reason and key source are closed unions

## What

ProviderTurnLog in packages/inference/src/contract/agent-sdk-backend.ts types terminalReason and apiKeySource as string.

## Why

A loose string accepts any spelling and no reader can switch on it exhaustively.

## Done when

Both fields are importable tuples with derived unions, the runner writes only members, and an unknown SDK value maps to a named member at the parse.

## Evidence

Filled at landing: what ran and where its output is.
