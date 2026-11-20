---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: security
plan: chat-html-and-presets
---

# Verify whether untrusted markdown ids reach the main page unprefixed

## What

A security review noticed in passing that the markdown renderer keeps author-written id attributes unprefixed when it draws untrusted rows in the main page, outside a frame. Unverified. If true, a member or a model reply could name an element after a global or after an id the app reads, the DOM-clobbering class.

## Why

An author-controlled id in the main document can shadow globals or app lookups for every viewer of the room.

## Done when

A security-builder confirms or refutes it on the real render path; if confirmed, untrusted ids are prefixed or dropped at the sanitize schema, with a test; the finding is recorded either way.

## Evidence

Filled at landing: what ran and where its output is.
