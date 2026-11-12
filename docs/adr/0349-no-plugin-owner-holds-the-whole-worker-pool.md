---
kind: adr
status: active
updated: 2026-11-12
---

# No plugin owner holds the whole Worker pool

## Context

All plugin Workers run under one broker and are shared across owners. When one owner held every Worker, another owner's call waited for that owner's stuck work.

## Decision

Where more than one owner can run plugin code, an owner holds at most all but one of the shared plugin capacity. The full decision text lands with the change that builds it.

## Consequences

Another owner's call is served while one owner's work is stuck.

## Alternatives rejected

Letting one owner hold every Worker: another owner waits on work it cannot end.
