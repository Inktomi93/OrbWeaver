---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: inference
plan: cross-surface-consistency
---

# A refused embed, rerank or image request does not revoke a good key

## What

The rule that tells a refused request from a rejected key on a 403 runs only in the chat turn, the key check and the model listing. The executor strikes a key on any auth failure, and the embed, rerank and image backends call every 403 an auth failure.

## Why

NanoGPT serves embeddings and rerank and LiteRouter serves images, so one off-plan model in a background embed revokes the key and chat stops with it.

## Done when

One rule decides a strike for every task. Cases through the composed root cover embed, rerank and image, with the 401 and coded-403 controls.

## Evidence

Filled at landing: what ran and where its output is.
