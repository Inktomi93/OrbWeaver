---
kind: decision
status: doing
updated: 2026-10-11
priority: P2
area: inference
lane: wt/agent-a53b04e959c9a90db
---

# Reconcile extras precedence law

## What

G14: ADR 143/156 say the modelled value wins on collision while the Custom body rules and Tier-3b say the user wins. Evidence: local-provider audit ~/homelab/development/probe-archive/local-server-audit/reports/local-provider-gaps/REPORT.md.

## Why

Local-provider integration must match what the server actually does; owner-approved repair set.

## Done when

Owner rules one precedence and the conflicting law is amended before any collision behaviour changes.

## Evidence

Owner ruling (custom body wins): the user's custom body is merged last and wins every collision, preset knobs included, on connections that expose the body field. Amend ADR 0143/0156 to match Tier-3b before changing any collision behaviour.
