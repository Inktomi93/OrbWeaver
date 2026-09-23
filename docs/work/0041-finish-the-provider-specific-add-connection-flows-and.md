---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: client
---

# Finish the provider-specific add-connection flows and the connection acceptance matrix

## What

Give each provider in the add-connection dialog the fields and checks it needs, instead of one generic form, and pin the acceptance matrix of provider by task that the inference cut-over promised.

## Why

The inference cut-over left one generic add flow, so provider-specific requirements are neither asked for nor checked at add time.

## Done when

Each built-in provider has an add flow covered by a component test, and a test enumerates the provider-by-task acceptance matrix and passes.

## Evidence

Filled at landing: what ran and where its output is.
