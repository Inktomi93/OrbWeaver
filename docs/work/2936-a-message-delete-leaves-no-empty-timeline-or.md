---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: stats
---

# A message delete leaves no empty timeline or model row

## What

A delete or retraction that empties a timeline bucket or a model row leaves that row on the live path at zero. A rebuild writes no row for it, so the timeline and the model list differ after a Recompute. The room and character deletes already remove such rows.

## Why

Live must equal a rebuild on every shown figure.

## Done when

A server case deletes the only turn in a bucket, and the timeline and the model list are equal on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
