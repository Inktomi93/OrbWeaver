---
kind: tooling
status: open
updated: 2026-11-07
priority: P3
area: ui
plan: cross-surface-consistency
---

# The chat-track of carrier has one home

## What

The of carrier in chat-track.tsx keeps a forwarded className because the caller's tokens are judged at the of site. Tie it to one home so the rule needs no named residual.

## Why

A named residual is a review check where the lint could own it.

## Done when

The rule closes the carrier with no residual, or the reason it cannot is recorded.

## Evidence

Filled at landing: what ran and where its output is.
