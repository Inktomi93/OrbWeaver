---
kind: tooling
status: blocked
updated: 2026-11-22
priority: P3
area: tooling
blocked: on 3882
plan: unwired-code
---

# Judge the params, shapes, ports and unions reports and fix their false-positive classes

## What

After the fields review, every other unwired report needs a judged pass on main after the scanner fixes: params, shapes, ports, the unbuilt unions rows, removed-keys, and the first runs of codes, procedures and columns, plus one --cross-check run of each scan that has engine two. Rows judged by the fields review are tracked by 3837.

## Why

Cleanup items delete against these reports, so a false-positive class here removes live code.

## Done when

The orchestrator judges each report on main, files each false-positive class with a red-first fixture and a scanner fix, boards real findings into the judged list, and reruns each report clean of the fixed classes.

## Evidence

Filled at landing: what ran and where its output is.
