---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# Real-tree unwired runs report profiler phases and heap retainers instead of process time

## What

Real-tree unwired runs in briefs, merge recipes and done notes measure memory with the process timer, which cannot say what grew. The lane skill and the orchestrator merge-train text name no profiler.

## Why

The graph peak rose across a session and nobody could say which build step grew it.

## Done when

The lane skill and the orchestrator merge-train text require wall and heap profiling on every real-tree unwired run and a report of phase times, request counts, the compiler heap's top retainers and the peak read from the profile; one profiled graph run on main explains the session's graph peak rise, with the send chase and the variance walk checked as suspects.

## Evidence

Filled at landing: what ran and where its output is.
