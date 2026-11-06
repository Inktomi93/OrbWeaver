---
kind: work
status: blocked
updated: 2026-11-06
priority: P3
area: testing
blocked: wake gone docs/plans/type-law/design.md
plan: restoration-register
---

# Build the read-only report that chooses what to test, per the restoration-register plan's selection section

## What

Build the read-only report that chooses what to test, as the Choosing what to test section of docs/plans/restoration-register/design.md describes.

## Why

The plan wants a worklist of edges ranked by risk, as a report and never as a gate, so test effort goes to untested outcomes first. The plan is parked until the type plan finishes.

## Done when

The report runs read-only on packages/kit and domain/tag and prints a ranked worklist of callable edges with their derived outcomes. It fails no check. It stops, with that recorded, if the output is noise.

## Evidence

Filled at landing: what ran and where its output is.
