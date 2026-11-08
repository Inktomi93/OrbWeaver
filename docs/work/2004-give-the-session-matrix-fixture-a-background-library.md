---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-a9db028f1d127e510
plan: test-foundation
---

# Give the session-matrix fixture a background-library asset

## What

The session-matrix F10 case fails at matrix discovery on main with no background-library asset. Confirm whether the ready-app console hook read is a second cause.

## Why

A session matrix has no green proof while this case is red.

## Done when

F10 passes through a real matrix call.

## Evidence

Filled at landing: what ran and where its output is.
