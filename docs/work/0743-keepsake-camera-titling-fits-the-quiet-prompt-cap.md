---
kind: bug
status: doing
updated: 2026-10-05
priority: P2
area: plugin
lane: codex/launch-plugin-polish
---

# Keepsake Camera titling fits the quiet prompt cap

## What

Keepsake Camera's titling pass joins ten messages unclamped into llm.quiet, which passes the 8192-character quiet cap on long scenes, so the title silently falls back to the generic A kept moment. Same defect Affinity Tracker had; found by the plugin P1 lane.

## Why

Long scenes never get a real postcard title.

## Done when

The titling prompt is clamped under the quiet cap the way Affinity Tracker's is, with a test on a long transcript.

## Evidence

Filled at landing: what ran and where its output is.
