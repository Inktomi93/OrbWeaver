---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: docs
---

# Define the chat wave in the client state law

## What

client-architecture-state-and-gates.md section 13 rule 5 names the chat wave's held refetch as part of the single chokepoint but never defines a chat wave, and the chat-view testkit header omits the new message-row builder.

## Why

A reader cannot tell what a chat wave is or where its builder lives.

## Done when

The law defines a chat wave in one sentence and the chat-view header names makeMessageView.

## Evidence

Filled at landing: what ran and where its output is.
