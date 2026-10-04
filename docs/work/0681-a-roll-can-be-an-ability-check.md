---
kind: bug
status: open
updated: 2026-10-04
priority: P2
area: rpg
---

# A roll can be an ability check

## What

Roll d20 appends a raw '\[dice: d20 → N]' stamp (server rpg/verbs/roll-dice.ts) with no ability or modifier although the sheet has attributes, and the stamp renders as plain text. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

A roll can pick an ability and apply its modifier, and the result renders as a chip, with tests.

## Evidence

Filled at landing: what ran and where its output is.
