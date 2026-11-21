---
kind: tooling
status: open
updated: 2026-11-21
priority: P3
area: tooling
---

# The stage connection flag accepts the Gemini, OpenAI and DeepSeek keys

## What

pnpm snap --stage-connection accepts only the OpenRouter and Anthropic key names and the local engine.

## Why

The owner allows every repo provider key for live checks.

## Done when

The flag accepts GEMINI_PROBE_KEY, OPENAI_PROBE_KEY and DEEPSEEK_PROBE_KEY, each with a named default model, with the leak test covering them.

## Evidence

Filled at landing: what ran and where its output is.
