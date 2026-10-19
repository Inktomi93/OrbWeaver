---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# regkeys and registry-candidates unwrap transparent receiver wrappers

## What

pnpm ast regkeys and registry-candidates miss a receiver written through parentheses, as or satisfies. From the 955 version table.

## Why

A registry read through a wrapper is invisible to the two verbs that inventory registries.

## Done when

Both verbs unwrap the receiver with red-first cases and unchanged output on unwrapped receivers.

## Evidence

Filled at landing: what ran and where its output is.
