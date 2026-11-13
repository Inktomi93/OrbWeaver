---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: deployment
plan: authorization-and-visibility
---

# A deployment check shows no proxy answers CORS preflights

## What

The cross-site header rule holds only while nothing in front of the app answers a CORS preflight. The deployment security law says so, and nothing checks a deployment.

## Why

A proxy that answers preflights lets another site send the header, and the operator has no way to see it.

## Done when

The documented deployment has a check, a boot probe or a documented command, or a ruling records that this is the operator's duty.

## Evidence

Filled at landing: what ran and where its output is.
