---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# The plugin CPU window does not bound host-side marshal work

## What

The engine checks a guest's CPU deadline only between interpreter steps, so time the host spends marshalling a large value on the guest's behalf is not counted. Measured with a real guest: a snippet with a five-second window that loops calls carrying a one-mebibyte value ran well past its window on main and longer on the JSON marshal; with larger values it ran for minutes. The in-flight cap and the per-call deadline do not bound it. Source: the leg-three security review of the security lane under reports/review.

## Why

A member's snippet or a plugin can hold a turn and a host thread far past the budget the sandbox promises, by sending large values in a loop.

## Done when

Host-side work done for a guest call is charged against that guest's budget: a wall-clock check around each marshal crossing, a per-invocation cap on total bytes crossed, or both, by a recorded decision. A real-guest test loops cap-sized calls and shows the invocation ends within a stated margin of its window.

## Evidence

Filled at landing: what ran and where its output is.
