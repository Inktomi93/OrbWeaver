---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: chat
---

# A guided rewrite request carries the reply it rewrites

## What

The recorded guided rewrite reply says there is no previous response to revise, which suggests the rewrite request does not carry the target reply to the model. Check the assembled rewrite request and fix it if the reply is missing.

## Why

A rewrite the model cannot see is a fresh reply under the wrong name.

## Done when

A test drives a guided rewrite through the real assembly and asserts the request carries the target reply, and the rewrite tape is re-recorded with a reply that revises it.

## Evidence

Filled at landing: what ran and where its output is.
