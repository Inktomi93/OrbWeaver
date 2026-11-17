---
kind: work
status: open
updated: 2026-11-17
priority: P3
area: inference
---

# Measure top-level verbosity acceptance on a plain openai-compatible server

## What

The OR dialect's verbosity forward is measured (the vendor ledger's H1(b) note), and the SDK dists prove the field is WRITTEN into the chat body (@ai-sdk/openai-compatible 3.0.75 writes verbosity, @ai-sdk/openai 4.0.99 writes text.verbosity); nothing yet measures whether a plain (non-OR) openai-compatible server honors the top-level verbosity field. Run the probe pattern from the vendor ledger against at least one server that accepts it (OpenAI proper) and one that silently drops it, and bank the outcome in deepseek-api-surface.md or the matching vendor doc.

## Why

The openai-compat chat wire's sentVerbosity claim in the sampling log line currently rests on 'the SDK writes the field', not 'a server honors it'. The ledger says UNPROVEN; the honest close is a measured capture, not a stronger word.

## Done when

A machine-written capture (status, request body, usage per call) banked in the vendor ledger, and the sampling-line header in v4/result.ts updated to cite it.

## Evidence

Filled at landing: what ran and where its output is.
