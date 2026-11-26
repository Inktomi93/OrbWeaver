---
kind: work
status: open
updated: 2026-11-26
priority: P2
area: inference
---

# vLLM sampler knobs ride the vllm_xargs envelope

## What

The vllm row sends extended sampler knobs (min_p, DRY, XTC, dynatemp, smoothing, top_n_sigma, top_a, repeat_last_n) at the top level of the chat body, where vLLM drops unknown fields without a word; a vLLM with logits processors reads them only under vllm_xargs, as strings, numbers or flat lists. On speculative (MTP) lanes vLLM refuses a native min_p and logit_bias with a 400, so those ride vllm_xargs too. A finite repetition window rides vllm_xargs repetition_penalty plus repeat_last_n; without a window the native repetition_penalty rides alone, since both at once is a 400.

## Why

Every extended sampler a preset sets on a vLLM connection does nothing today, and the owner's vLLM lanes now honor them (the samplers brief under the stack's reports directory).

## Done when

An endpoint feature on the vllm row spells the extended knobs into vllm_xargs with the llama.cpp key names, min_p and logit_bias move there, the repetition window follows the native-or-envelope rule, and body-shaping tests through the composed root cover each, with no provider branch in the backend.

## Evidence

Filled at landing: what ran and where its output is.
