---
kind: decision
status: doing
updated: 2026-11-20
priority: P2
area: chat
lane: wt/agent-a97cbe1e5a30f9041
---

# The owner rules whether a reply the reader stopped carries a mark

## What

A reply the reader stops mid-stream stays as an ordinary finished reply. The server stores that the reader ended it; no client surface reads that, so the row looks the same as a reply the model ended, and a reply cut mid-sentence can read later as a failure.

## Why

The kept row was built as an ordinary reply on purpose. A quiet mark is a design choice with a cost on every stopped row.

## Done when

Owner ruling, taken from the recommendation: a reply the reader stopped keeps a quiet Stopped mark on its kept row, in a neutral tone, on every chat style; a CT covers it on each style.

## Evidence

Filled at landing: what ran and where its output is.
