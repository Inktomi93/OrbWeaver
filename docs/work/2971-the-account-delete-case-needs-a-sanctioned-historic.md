---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The account-delete case needs a sanctioned historic-state home

## What

The account-delete case in the turn global-variables test deletes a `users` row inline, a state the product cannot produce.

## Why

Checklist rule 11 in `.claude/rules/test-authoring.md`: a state the product cannot produce needs a sanctioned home.

## Done when

The delete goes through a historic-state helper the testkit README (`tests/support/README.md`) names, or the case is dropped as an accepted gap.

## Evidence

Filled at landing: what ran and where its output is.
