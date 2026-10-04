---
kind: decision
status: open
updated: 2026-10-04
priority: P2
area: inference
---

# Reconcile extras precedence law

## What

G14: ADR 143/156 say the modelled value wins on collision while the Custom body rules and Tier-3b say the user wins. Evidence: local-provider audit ~/homelab/development/probe-archive/local-server-audit/reports/local-provider-gaps/REPORT.md.

## Why

Local-provider integration must match what the server actually does; owner-approved repair set.

## Done when

Owner rules one precedence and the conflicting law is amended before any collision behaviour changes.

## Evidence

Filled at landing: what ran and where its output is.
