---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
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
