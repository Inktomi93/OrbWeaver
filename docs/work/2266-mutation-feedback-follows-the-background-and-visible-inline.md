---
kind: work
status: open
updated: 2026-11-09
priority: P2
area: client
plan: cross-surface-consistency
---

# Mutation feedback follows the background and visible-inline rulings

## What

Owner ruling: background housekeeping the person did not start (husk reap, temp-chat sweep, plugin crash report) logs its failure and shows no toast; when the failing surface is on screen and already states the failure inline, no toast repeats it (restart refusal in its confirm dialog, the schema-plan ask, which also toasts once per typing pause). Amend client-architecture-state-and-gates §11 to never neither, and not both while the inline line is visible, with a typed background class in the mutation factory instead of an opt-out.

## Why

A red error for housekeeping the person never started, and a toast that repeats the line beside it, both read as noise.

## Done when

§11 states both rulings, the factory types the background and inline-visible classes so a site cannot omit feedback by accident, the named sites follow them, and CTs show one failure surface per case. Source: acceptance part 4 report B.

## Evidence

Filled at landing: what ran and where its output is.
