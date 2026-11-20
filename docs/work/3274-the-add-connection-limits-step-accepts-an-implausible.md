---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: connection
plan: cross-surface-consistency
---

# The add-connection limits step accepts an implausible context window

## What

The context window field accepts and saves an eleven-digit value with no refusal, though it refuses zero, negatives, fractions and text.

## Why

A typo with extra digits silently sets every preset's ceiling for that connection, and long chats then fail at the server.

## Done when

The field refuses values above a stated plausible bound, with a refusal that names the bound. A test pins the bound through the shared fact parser.

## Evidence

Filled at landing: what ran and where its output is.
