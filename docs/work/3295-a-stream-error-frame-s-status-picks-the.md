---
kind: bug
status: doing
updated: 2026-11-15
priority: P3
area: ui
lane: wt/agent-a5487884af20f9847
---

# A stream error frame's status picks the turn's failure kind

## What

A chunk that carries an `error` object (NanoGPT's documented mid-stream frame, `{status, message, code}`) now fails the turn in the service's words, but always as `server`, retryable. Map the frame's `status` through the HTTP status table the pre-stream path uses, so a mid-stream 429 reads as a rate limit and a 402 as billing.

## Why

NanoGPT's Error Handling page says to retry a mid-stream failure only when its status allows it (408, 429, 500, 503); a 402 or 400 frame should not read as a server fault.

## Done when

undefined

## Evidence

Filled at landing: what ran and where its output is.
