---
kind: work
status: open
updated: 2026-11-12
priority: P2
area: security
plan: checked-law
---

# A test proves reserved Claude environment keys never reach a spawn outside the agent SDK

## What

`docs/law/Spine-Config-and-Serialization.md` rules a credential firewall (D8). The census found one import-direction rule behind it and no test of `RESERVED_CLAUDE_ENV_KEYS` or of the `claudeEnv` strip. Confirm that on the tree, then test the production spawn paths.

## Why

An import rule cannot see a reserved key that reaches a child process environment by value.

## Done when

A test at the mirror of each production spawn path fails when a reserved key is present in the environment of a spawn outside the agent SDK, with a shown red.

## Evidence

Filled at landing: what ran and where its output is.
