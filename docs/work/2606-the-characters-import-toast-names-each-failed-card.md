---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: cross-surface-consistency
---

# The Characters import toast names each failed card by its own reason

## What

When a batch of character cards partly fails, the Characters import dialog's toast line says each failed file is not a character card, whatever the server's reason. The wire now carries a closed reason per failed card and the Backup import already reads a sentence per reason from the card import copy home.

## Why

A card the server refused as invalid or failed to store is described as the wrong kind of file, so the person picks a different file instead of fixing the one they have.

## Done when

The partial-batch line reads its sentence per reason from the card import copy home, with a component test through the production dialog for each reason.

## Evidence

Filled at landing: what ran and where its output is.
