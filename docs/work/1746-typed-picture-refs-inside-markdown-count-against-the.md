---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: server
plan: unwired-code
---

# Typed picture refs inside markdown count against the send picture limit

## What

Count typed picture references inside markdown text toward the per-send picture limit that block attachments already share.

## Why

The send cap is `SEND_BLOCK_LIMITS.blocks` in `packages/contracts/src/chat/content-blocks.ts`, and it bounds the block list and the attachment list only. A markdown block may carry any number of typed picture references (`![alt](asset:id)`) inside its 100000-character text, so that way of carrying pictures sits outside the cap.

## Done when

A test sends text with more typed picture references than the cap and sees a refusal. A send at the cap, mixing blocks and typed references, still succeeds.

## Evidence

Filled at landing: what ran and where its output is.
