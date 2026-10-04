---
kind: decision
status: open
updated: 2026-10-04
priority: P3
area: inference
---

# Decide the connection test's route scope

## What

G12: the connection test intentionally uses /v1 (D296) and so does not test the actual native chat route. Evidence: local-provider audit ~/homelab/development/probe-archive/local-server-audit/reports/local-provider-gaps/REPORT.md.

## Why

Local-provider integration must match what the server actually does; owner-approved repair set.

## Done when

Owner decision recorded: label the test's scope, or amend D296 to test the resolved route.

## Evidence

Filled at landing: what ran and where its output is.
