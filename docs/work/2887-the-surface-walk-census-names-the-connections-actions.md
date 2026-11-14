---
kind: tooling
status: open
updated: 2026-11-14
priority: P3
area: testing
plan: surface-walk
---

# The surface-walk census names the Connections actions as they are

## What

`tests/e2e/support/surface-config.ts` lists a Connections action named List models. The Add a connection dialog now lists a hosted provider's models on paste, on leaving the key field and on a saved-key choice; the List models press remains for an own server only.

## Why

A census row that names an action the reader no longer takes sends the walk after a control that is absent for most providers.

## Done when

The census row names the listing as it happens for hosted and own-server providers, and the walk's Connections cases pass against it.

## Evidence

Filled at landing: what ran and where its output is.
