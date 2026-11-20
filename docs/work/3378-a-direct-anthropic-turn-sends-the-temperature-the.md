---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A direct Anthropic turn sends the temperature the user set

## What

On the direct anthropic-messages wire no model states a sampler range: curated/anthropic.ts carries only the temperature/top_p exclusivity, and measured/anthropic.ts is empty, so the funnel drops every knob a user sets and the room shows the 'wasn't used for this reply' notice. tests/inference/conformance/sampler-coverage.suite.int.test.ts pins that today as 'direct Anthropic states no ranges until a measured entry (D68)'.

## Why

D68 keeps the direct wire's ranges fail-closed until a probe validates each model's honoured set; until then a direct Anthropic user's temperature, top_p and top_k never reach the model.

## Done when

A dated probe against a real key writes, per Claude model on the direct wire, the honoured set and span (temperature 0-1, top_p, top_k, stop) into measured/anthropic.ts with script, date and request id; the guard case for direct Anthropic is rewritten to expect that set; a wire case shows a set temperature in the request body.

## Evidence

Filled at landing: what ran and where its output is.
