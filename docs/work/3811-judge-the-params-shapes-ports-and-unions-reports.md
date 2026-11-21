---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: unwired-code
---

# Judge the params, shapes, ports and unions reports and fix their false-positive classes

## What

After the fields review, the other unwired reports have had no false-positive pass: params (121 rows, 4 cross-check disagreements, reports/unwired/params.json), shapes (264 rows, reports/unwired/shapes.json, which feeds 3748), ports (last run before this session's scanner fixes) and the 27 unbuilt unions rows.

## Why

Cleanup items delete against these reports, so a false-positive class here removes live code.

## Done when

The orchestrator samples each report as the fields review did, files each false-positive class with a red-first fixture and a scanner fix, boards real findings, and reruns each report clean of the fixed classes.

## Evidence

Filled at landing: what ran and where its output is.
