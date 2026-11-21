---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-aa5f4ceadba2459ab
plan: unwired-code
---

# The unwired params scan reads spread and shared-type supplies

## What

The params review found false-positive classes: a conditional spread that supplies an option (rerank instruction), a pipeline spread that adds a field (imageEmbed embeddingAccounting), an options type shared with a sibling callee that supplies the field (executeDisplayScripts, RegexPass.execute, useScrollFadeX, everywhereTasks), a field added in the callee body (completeCommand refusal), and a structural view of a DOM method (MatchMediaListView). Details in reports/unwired/params-judge.md.

## Why

These rows bury the real unsupplied parameters.

## Done when

Each class has a red-first planted case in tests/tooling/unwired with an unsupplied twin, including a parameter named only in a comment; the scanner credits each supply through the checker; the orchestrator reruns pnpm unwired params.

## Evidence

Filled at landing: what ran and where its output is.
