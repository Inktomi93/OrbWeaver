---
kind: tooling
status: doing
updated: 2026-10-07
priority: P1
area: ci
lane: codex/ci-media-native-resolver
---

# Repair offline media installation on prepared runners

## What

Preserve compatible preinstalled packages while installing the delivered media dependency closure offline.

## Why

Explicit dependency installation can force package replacement on prepared runners and stop media tests before execution.

## Done when

Native runner-state controls prove offline installation, unchanged unrelated packages, complete media functionality and refusal of incomplete or invalid bundles.

## Evidence

Filled at landing: what ran and where its output is.
