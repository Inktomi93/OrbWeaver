---
kind: tooling
status: open
updated: 2026-11-24
priority: P3
area: tooling
plan: unwired-code
---

# The fields scan decides the four review classes the logged pass left open

## What

After the logged pass, four classes from the fields hand review still report: a union discriminant read by switch, form field path writes, preset knobs read through mapped controls, and destructured reads. The destructured class is mixed: some rows are real findings. Form paths and preset knobs look like gaps in the key resolver's form-path step.

## Why

These rows keep reporting live fields as findings, so each rerun re-judges them by hand.

## Done when

Each class is credited soundly or listed in the design's fields limits with its reason, with red-first planted cases and a twin per credited class, and the destructured rows are split into credited reads and real findings.

## Evidence

Filled at landing: what ran and where its output is.
