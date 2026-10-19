---
kind: bug
status: doing
updated: 2026-10-19
priority: P3
area: tooling
lane: wt/agent-a6adcf445a5debd8e
plan: test-foundation
---

# Probe ORB_ENV_NO_FILE refusal reads process.env before the env loader

## What

scripts/probes/composed-chat-funding.ts and scripts/probes/caching/run.ts check ORB_ENV_NO_FILE through readEnvKey, which also reads .env files, while the server env loader already ran from static imports. A .env that declares ORB_ENV_NO_FILE satisfies the check and still loads into the graph (reproduced by the 977 security review).

## Why

The refusal exists to keep the operator's .env out of a composed probe graph; reading the same .env defeats it.

## Done when

Each composed probe imports a first side-effect module that reads process.env directly, and a .env declaring the key no longer lets a composed probe boot.

## Evidence

Filled at landing: what ran and where its output is.
