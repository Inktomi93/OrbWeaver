---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a153864a73f49fb3e
plan: unwired-code
---

# Worlds-check starts its compiler through the watched session

## What

tooling/src/unwired/graph/worlds-check.ts constructs its own TypeScript API directly, so its compiler gets no crash note and no peak in the profile.

## Why

A compiler death there is a bare dead pipe with no cause.

## Done when

Worlds-check starts its compiler through native.ts's watched start, and a planted kill names the signal and the step.

## Evidence

Filled at landing: what ran and where its output is.
