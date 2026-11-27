---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: chat
lane: wt/agent-af34818252fd77fd2
plan: unwired-code
---

# Presets offer the carry-reasoning conversation mode

## What

CARRY_REASONING_MODES.conversation is read in seven places and a preset can store carryReasoning through promptConfigSchema, and the capability registry lists it as a control, but the preset params deck has no control that sets it.

## Why

A request-shaping setting with no control cannot be chosen; the owner ruled that such fields stay and get wired.

## Done when

The preset params deck shows a carry-reasoning control for models whose capability lists it, the chosen mode is stored and reaches the request, and a CT covers setting it.

## Evidence

Filled at landing: what ran and where its output is.
