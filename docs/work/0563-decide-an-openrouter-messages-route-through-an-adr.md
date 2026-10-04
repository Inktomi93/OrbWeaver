---
kind: decision
status: open
updated: 2026-10-04
priority: P3
area: inference
---

# Decide an OpenRouter Messages route through an ADR 0288 revision

## What

The local-provider audit's architecture note proposed OpenRouter's Messages endpoint; ADR 0288 is active and already amends D174, rejecting it for adapter/diagnostic reasons. Evidence: local-provider audit ~/homelab/development/probe-archive/local-server-audit/reports/local-provider-gaps/REPORT.md.

## Why

Local-provider integration must match what the server actually does; owner-approved repair set.

## Done when

A smaller proposal and an explicit ADR 0288 revision are written and ruled before any implementation.

## Evidence

Filled at landing: what ran and where its output is.
