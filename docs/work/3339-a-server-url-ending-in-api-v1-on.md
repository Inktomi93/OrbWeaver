---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A Server URL ending in /api/v1 on a Custom connection fails for NanoGPT

## What

Close as answered by the NanoGPT built-in. The cause stays unproven: keyless calls to `https://nano-gpt.com/api/v1/models` and `https://nano-gpt.com/api/v1/chat/completions` answered 200 and 401 directly, with no redirect, and `https://api.nano-gpt.com/v1/models` is an undocumented alias that also answers 200, which is why a bare host worked. A live call with a key is the only way to prove what the Custom path tripped on.

## Why

The NanoGPT row fixes the base URL, so a user no longer types one.

## Done when

Closed by the NanoGPT built-in, with the cause recorded as not provable without a keyed call.

## Evidence

Filled at landing: what ran and where its output is.
