---
kind: tooling
status: doing
updated: 2026-11-22
priority: P2
area: tooling
lane: wt/agent-a4e9784beb9524066
plan: unwired-code
---

# The unwired reports keep judged rows apart from new ones

## What

Every unwired report prints each row with verdict ask, so a rerun after a hand review shows the judged rows mixed in with new ones. A judged list beside the deliberate list in tooling/src/unwired/ maps each row key to the open docs/work item that owns its fix, every scan reports those rows in a judged bucket, and a stale entry is listed.

## Why

The owner reviewed every fields row by hand and most rows now wait on open board items; without the split a rerun cannot show what is new, and review work repeats.

## Done when

fields, params, unions, shapes, codes, procedures and columns reports carry a judged bucket with the owning item, an entry whose row no longer reports or whose item has landed is listed as stale, planted cases cover each, and the fields list is seeded from the review's item text with the tie level per row.

## Evidence

Filled at landing: what ran and where its output is.
