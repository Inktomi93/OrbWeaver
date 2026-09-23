---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: inference
---

# Return a truncated reply when agent-sdk hits the output cap

## What

On agent-sdk a reply longer than maxOutputTokens makes the Claude Code CLI run up to three continuation calls and then fail with an api_error mapped to max_output. Direct and OpenRouter return the truncated reply.

## Why

The same cap should behave the same on every route, and the continuations spend extra tokens.

## Done when

agent-sdk returns the truncated reply with a max_output finish reason and no continuation calls, or the difference is a documented capability fact the UI surfaces.

## Evidence

Filled at landing: what ran and where its output is.
