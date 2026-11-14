---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: tests
plan: typed-enforcers
---

# The agent SDK's environment-name constants leave the preset schema module

## What

Three environment-name constants for the agent SDK (`CLAUDE_OAUTH_TOKEN_ENV`, `ANTHROPIC_API_KEY_ENV`, `CLAUDE_CONFIG_DIR_ENV`) are defined inside `packages/contracts/src/preset/index.ts`, a large module of preset schemas. It is not a wildcard re-export: the constants live in the schema file itself, so any process that needs one name evaluates every preset schema. The test stand-in children under `tests/support/node/` pay that at each cold start, and so does any production child that reads them. Decide the constants' real home (a small module beside the SDK provider contract or the child-environment owner), move them, and keep one definition.

## Why

A credential's environment name is not generation config, and a short-lived child should not load the preset schemas to learn it.

## Done when

The three constants have one home in a small module, the preset module no longer defines them, every reader imports the new home, and a stand-in child's cold start is measured before and after.

## Evidence

Filled at landing: what ran and where its output is.
