---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: server
plan: unwired-code
---

# Parsing a large SillyTavern chat does not block the event loop (no gap over 200 ms on 5 MB chats)

## What

Parse a large SillyTavern chat in slices that yield to the event loop.

## Why

A single synchronous parse of a large chat file blocks the event loop, so every other request waits until it ends.

## Done when

A test parses a chat of about five megabytes and records no event-loop gap above 200 ms.

## Evidence

Filled at landing: what ran and where its output is.
