---
kind: bug
status: blocked
updated: 2026-10-10
blocked: owner
---

# Verify collection responsiveness during local indexing

## What

Bounded native inference and worker CPU budgeting are merged. Verify authenticated collection reads while the deployed container indexes the imported library.

## Why

Native probes establish memory and CPU behavior but do not establish authenticated tab responsiveness.

## Done when

Verify real Characters, Chats and Presets tab loads under background indexing. Record observed responsiveness without substituting unauthenticated probes.

## Evidence

Filled at landing: what ran and where its output is.
