---
kind: bug
status: doing
updated: 2026-11-24
priority: P2
area: tooling
lane: wt/agent-abf90df0f06f44a65
plan: unwired-code
---

# An object-literal getter gets its role

## What

An object-literal getter declaration gets no role in the graph census.

## Why

A getter that callers read can be judged dead.

## Done when

A planted object-literal getter read by a caller gets a read, a getter nobody reads stays unread, and the census shows no gap for this family.

## Evidence

Filled at landing: what ran and where its output is.
