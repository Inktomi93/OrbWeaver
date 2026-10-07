---
kind: tooling
status: doing
updated: 2026-10-07
priority: P1
area: ci
lane: codex/ci-media-distribution
---

# Bound CI media prerequisite setup

## What

Remove or bound unnecessary system package work while preserving the media tests prerequisites.

## Why

A runner can wait in package setup before product tests begin.

## Done when

Media prerequisite setup uses the actual tested runtime and cannot wait indefinitely; provisioning controls prove failure remains visible.

## Evidence

Filled at landing: what ran and where its output is.
