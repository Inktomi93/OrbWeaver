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

The bundled Claude Code runtime (0.3.280) sets `max_tokens` from `CLAUDE_CODE_MAX_OUTPUT_TOKENS`, which orb already passes as the user's cap. On a `max_tokens` stop it continues the reply up to three times. The limit is a constant in the query loop, and no env variable or option changes it. So a capped agent-sdk reply still costs the continuation calls; that difference is a documented capability fact in the header of `packages/inference/src/backends/agent-sdk/runner.ts`. A reply that ends inside the continuations completes normally and runs past the cap: live, a 400-token cap gave a 1464-token reply with finish `stop`. A reply that does not end is now returned as a truncated reply with finish reason `length`, instead of a `max_output` error. Both carry `outputCapReached` in the claude-sub metadata. A capped turn that spent every call on thinking wrote no text and stays a `max_output` error. The runner tests pin each case. The UI does not surface `outputCapReached` yet.
