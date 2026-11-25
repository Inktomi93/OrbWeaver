---
kind: bug
status: open
updated: 2026-11-25
priority: P3
area: security
---

# An approved plugin provider id keeps its approval when a later upgrade changes that provider's definition

## What

The re-consent echo matches providers by id, so once an owner approves a provider id, a later upgrade can change an unclaimed provider's definition (base URL, models, kind) under that same id with no re-consent; a claimed id is refused at activation by the connection claim.

## Why

The owner approved what the card showed for that id, not whatever a later version puts under it.

## Done when

A changed definition under an approved but unclaimed provider id counts as widening in manifestWidening and waits for re-consent, with a case and a twin where an unchanged definition reactivates.

## Evidence

Filled at landing: what ran and where its output is.
