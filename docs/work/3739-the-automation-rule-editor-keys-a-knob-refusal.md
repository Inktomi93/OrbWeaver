---
kind: bug
status: open
updated: 2026-11-21
priority: P2
area: automation
---

# The automation rule editor keys a knob refusal on a typed reason, not the server's message

## What

packages/client/src/features/automation/lib/rule-mutations.ts runs KNOB_REFUSAL_RE against the server error message to find which knob a rule refused. The client never parses server prose; it keys on a reason code.

## Why

A reworded server sentence silently breaks the automation editor's knob refusal.

## Done when

The server returns the refused knob as a typed field on a coded refusal, the client reads that field, KNOB_REFUSAL_RE is gone, and a CT drives a refused knob through the real procedure.

## Evidence

Filled at landing: what ran and where its output is.
