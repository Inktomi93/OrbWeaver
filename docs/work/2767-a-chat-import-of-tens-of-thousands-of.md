---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: server
plan: import-robustness
---

# A chat import of tens of thousands of one-line messages holds the event loop past 200 ms

## What

The chat import commits one chat as one atomic batch. For a file of five megabytes made of one-line messages, about twenty-five thousand of them, that batch holds the event loop about 0.36 s, all of it inside SQLite reading the rows and writing them. A file of the same size made of reply-length messages holds it about 0.08 s.

## Why

No yield can split one atomic batch, so the bound grows with the row count. Shortening it means committing a chat in stages, which needs every reader of messages to hide a chat that is still landing.

## Done when

A test imports a five megabyte chat of one-line messages through the production import and finds no gap above 200 ms, or a decision record rules the bound accepted.

## Evidence

Filled at landing: what ran and where its output is.
