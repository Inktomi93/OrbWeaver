---
kind: bug
status: open
updated: 2026-09-23
priority: P3
area: connection
---

# Let a user edit a connection saved on a provider they can no longer see

## What

A connection a user saved on another user's plugin provider before c26bbc295 can be deleted but not edited: even a label patch hits requireProvider (connections.ts:151).

## Why

It fails closed, which is correct, but the user gets an unknown-provider error with no way forward except delete.

## Done when

The editor shows such a connection as unavailable with a clear reason and a delete action; a label-only patch either works or is refused with that reason. Test covers both.

## Evidence

Filled at landing: what ran and where its output is.
