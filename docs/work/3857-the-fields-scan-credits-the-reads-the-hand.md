---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The fields scan credits the reads the hand review ruled

## What

The fields hand review called rows false positives or read under the owner's rulings, and the scan still reports them, grouped in sixteen classes: a field picked by name into a log line, trace, debug route or bug bundle (the largest class), mapped, library or module-augmentation keys, destructured reads, a union discriminant read by switch, form field path writes, DOM or host object writes, writes into a column, provider or serializer sink, preset knobs read through mapped controls, CEL facts the rule engine exposes, persisted stores read whole, composition root ports, model structured output, and a literal acknowledgement output. The row lists with one example each are the bucket3_scanner_or_ruled section of the judged-list lane's bucket file.

## Why

Each class keeps live fields in the report as findings, so a reviewer re-judges them every run and a cleanup lane could delete a field the owner ruled is read.

## Done when

Each class is credited by the scan or reported in a named non-finding bucket with a red-first planted case and a twin that stays reported, a class the scan cannot decide soundly is listed in the design's fields limits instead, and the rerun on main shows the class rows gone from unwired.

## Evidence

Filled at landing: what ran and where its output is.
