---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: server
plan: import-robustness
---

# Leftovers from the preview-equals-run review

## What

An unreadable stored result logs one line on every read of its row. A row whose result alone is unreadable reads as succeeded with no summary. The runner's new validation test fakes an internal run with a spy. ADR 0117's historic list and the header of the workloads get verb still describe the earlier poison behaviour. The runner's validation has not been run against every workload kind.

## Why

Each is a small false statement or an unproven path left by the change.

## Done when

The line is logged once per row per process, the row reads as unreadable to its owner, the test drives a real run to an invalid result, both docs state the code, and every workload kind's happy path passes the runner's validation in a suite named in the item's evidence.

## Evidence

Filled at landing: what ran and where its output is.
