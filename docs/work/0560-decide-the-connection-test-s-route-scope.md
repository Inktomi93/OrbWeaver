---
kind: decision
status: doing
updated: 2026-10-11
priority: P3
area: inference
lane: wt/agent-a53b04e959c9a90db
---

# Decide the connection test's route scope

## What

G12: the connection test intentionally uses /v1 (D296) and so does not test the actual native chat route. Evidence: local-provider audit ~/homelab/development/probe-archive/local-server-audit/reports/local-provider-gaps/REPORT.md.

## Why

Local-provider integration must match what the server actually does; owner-approved repair set.

## Done when

Owner decision recorded: label the test's scope, or amend D296 to test the resolved route.

## Evidence

Owner ruling: test the resolved route. Amend D296 so the connection test exercises the same route chat uses.
