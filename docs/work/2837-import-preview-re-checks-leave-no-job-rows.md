---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: import
plan: import-robustness
---

# Import preview re-checks leave no job rows behind

## What

Each changed collision answer in the import preview runs a dry run of the persona files, and each dry run leaves one workload row that nothing deletes.

## Why

A long review fills the job history with rows the owner never asked for.

## Done when

A dry run made for the preview leaves no row after it ends, or its rows are excluded from every list and swept, with an integration test that counts rows after several answer changes.

## Evidence

Filled at landing: what ran and where its output is.
