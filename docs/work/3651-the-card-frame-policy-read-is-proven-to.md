---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: security
plan: chat-html-and-presets
---

# The card-frame policy read is proven to fail closed on a database fault

## What

A non-refusal fault in the character policy read now answers 500 at mint and serve, and the client shows the plain fallback with its notice, but only a scratch probe drove a fault through that read; no committed test does. The review also noted that no test proves a maximal valid mint body fits under the byte cap, that each mint and serve reads the room roster once per carried author in sequence, and that a fragment link can reach a matching id in another message.

## Why

A fail-closed path with no test can regress to a wider grant unseen.

## Done when

Committed integration tests drive a fault through the policy read at mint and serve and assert the 500 with no document, a maximal mint body is accepted, the roster reads are batched or their cost stated, and fragment links resolve within their own message.

## Evidence

Filled at landing: what ran and where its output is.
