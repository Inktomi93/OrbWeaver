---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: inference
lane: wt/agent-aecb78d3e3ce1089b
plan: unwired-code
---

# The live onEvent turn callback has a production caller or leaves the contract

## What

Every runner feeds ChatRequestBase.onEvent (packages/inference), but no server code sets it, so live events reach no one during a turn.

## Why

A callback every runner honors and nobody passes is dead surface that each new runner must keep implementing.

## Done when

The server passes onEvent where live events help, with a test, or the field and its runner feeds are removed.

## Evidence

Filled at landing: what ran and where its output is.
