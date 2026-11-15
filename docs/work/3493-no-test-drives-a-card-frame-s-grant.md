---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: server
plan: test-foundation
---

# No test drives a card frame's grant being withdrawn before it is served

## What

The serve half of `packages/server/src/entry/http/card-frame.ts` resolves a named character's media and posture again on every serve and serves the narrower policy. No test lowers a character's trust, switches interactive cards off or removes the viewer from the room and then serves the frame.

## Why

It is a revocation path on a security boundary that no test can turn red.

## Done when

An integration test through the composed server mints a trusted card, withdraws each grant in turn and sees the served policy narrow. It fails when the serve half returns the policy stored at mint.

## Evidence

Filled at landing: what ran and where its output is.
