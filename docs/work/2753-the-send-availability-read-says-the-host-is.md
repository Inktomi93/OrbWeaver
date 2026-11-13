---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: chat
plan: authorization-and-visibility
---

# The send-availability read says the host is unavailable

## What

In a room whose host is disabled, a member's availability read reports available while every send is refused, and the composer ignores a failed read and leaves Send enabled. The context-fit read checks the host's connection before its consent check.

## Why

The member types a message the room will refuse and learns it only after sending.

## Done when

The availability read answers unavailable with the `host_unavailable` reason, the composer disables Send with that text from the production copy module, and the context-fit read checks consent first, each with a test.

## Evidence

Filled at landing: what ran and where its output is.
