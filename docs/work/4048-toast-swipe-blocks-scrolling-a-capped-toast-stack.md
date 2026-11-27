---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: client
---

# Toast swipe blocks scrolling a capped toast stack on touch, and the envelope row gates on the tokenizer

## What

A touch drag over a toast starts its swipe-dismiss and blocks scrolling a capped toast stack, so a long notice at large text is reachable only through its sticky action. The connection editor shows the sampler envelope row by tokenizeApi being vllm because no provider-family feature names a vLLM-wire server.

## Why

A phone user at large text cannot read a long notice, and the envelope gate breaks for a vLLM-wire server that answers a different tokenizer.

## Done when

A vertical drag inside a capped stack scrolls it while a horizontal one dismisses, with a touch CT, and the envelope row reads a row feature that names the wire, with a CT for a non-vLLM own-server row.

## Evidence

Filled at landing: what ran and where its output is.
