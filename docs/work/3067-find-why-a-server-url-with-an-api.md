---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: connection
---

# Find why a Server URL with an /api/v1 path fails on Custom OpenAI-compatible

## What

`https://nano-gpt.com/api/v1` is the base URL NanoGPT's own SDK uses, and it failed as a Custom OpenAI-compatible Server URL where `https://api.nano-gpt.com` worked. Reproduce it and find whether URL normalisation, a redirect or the egress guard refuses it.

## Why

A documented, valid base URL fails with no reason the user can act on.

## Done when

The cause is named with evidence, and either the URL works or the field says why it does not, with a test.

## Evidence

Filled at landing: what ran and where its output is.
