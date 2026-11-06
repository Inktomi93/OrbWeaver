---
kind: work
status: open
updated: 2026-11-06
plan: test-foundation
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
