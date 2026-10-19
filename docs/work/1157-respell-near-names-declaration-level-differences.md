---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# respell --near names declaration-level differences

## What

A respell --near pair at 100% that differs only by an index signature (or another declaration-level member) prints an empty diff, so the reader sees a near-duplicate with no stated difference. From the 954 lane.

## Why

A near-pair report with no visible difference cannot be acted on.

## Done when

respell --near names each declaration-level difference (index signatures, call and construct signatures) in its diff, with a red-first case.

## Evidence

Filled at landing: what ran and where its output is.
