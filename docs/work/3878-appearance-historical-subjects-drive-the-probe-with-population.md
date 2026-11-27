---
kind: tooling
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-a6dde151e8a1bbb6d
plan: unwired-code
---

# Appearance historical subjects drive the probe with population and sample, or drop them

## What

AppearanceHistoricalSubject population and sample are declared in the client manifest and only validated by the tooling schema.

## Why

They describe how a subject is sampled, but no probe reads them.

## Done when

The appearance probe reads population and sample, or both leave the manifest and the tooling schema.

## Evidence

Filled at landing: what ran and where its output is.
