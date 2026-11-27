---
kind: work
status: open
updated: 2026-11-27
priority: P2
area: tooling
plan: unwired-code
---

# Re-judge the fields the old fields scan deleted against the reference graph

## What

The fields-scan sweeps (for example c48e35c502, 0ae2dc8508, e85b86dc31, 9400ebc772, df4fef9346, 75dc32e025, b60183f51b, 640eaaa925 and the other refactor commits that drop unread contract or client fields) deleted members on the old text scan. The reference graph has since found reads that scan missed (restated client types, library generics, conditional bindings, spread pushes). For each deleted member, judge it at its parent commit with the graph: was it read, was it collected and never shown, or was it dead.

## Why

A missed read became a false delete; owner ruling: data the app collects and never shows is a product item, not a delete.

## Done when

Every member those sweeps deleted carries a verdict with evidence; a read member is restored with a test; a collected-and-hidden one is minted as a product item or folded into an existing one such as 4076; the verdict table lives in a report.

## Evidence

Filled at landing: what ran and where its output is.
