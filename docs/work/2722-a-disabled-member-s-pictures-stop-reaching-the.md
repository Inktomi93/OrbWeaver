---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: security
plan: authorization-and-visibility
---

# A disabled member's pictures stop reaching the model, like a departed member's

## What

`resolve-media-ref.ts` in the chat domain resolves a picture for the model without the room's consent set, so a disabled member's pictures still reach the model while a departed member's do not. The owner's precedent, recorded on the disabled owner's art item, treats a disabled human exactly like a departed one.

## Why

A disabled account's content keeps flowing into turns after the account was shut off.

## Done when

The media reference read goes through the present-and-enabled consent set, with a test through the production turn that a disabled member's picture is left out and a present member's is sent.

## Evidence

Filled at landing: what ran and where its output is.
