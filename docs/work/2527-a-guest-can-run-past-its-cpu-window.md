---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# A guest can run past its CPU window, and without end, through host calls

## What

The engine checks a guest's CPU deadline only between interpreter steps, so time the host spends on the guest's behalf is not counted, and some host reads run guest code with no deadline at all. Measured with real guests on main: a snippet with a five-second window that loops calls carrying a large value runs far past its window; and three loop shapes never end and also hang shutdown: a setter on the error prototype with a refused host call in a loop, a log call given an object with a slow toString, and a host call given an object with a slow valueOf. Any member who can run a snippet can hold a worker at full CPU with no end. The in-flight cap and the per-call deadline do not bound any of this. Two of the remaining C-string reads in the plugin host (the log's toString read and the engine's own error builder) are the paths these shapes use. Source: the leg-three and leg-four security reviews of the security lane under reports/review, which hold the probes.

## Why

The sandbox promises that a guest's code ends at its window. Host-side work and guest code run from host reads escape that promise, and one member can take the plugin workers and a clean shutdown away from everyone.

## Done when

By ruling: a wall-clock check runs on every host call before any read that can run guest code, and its refusal is built without the engine's own error builder, so an expired guest is ended at its next host call whatever it does inside it. No host read coerces a guest value by a path that runs guest code (toString, valueOf, a setter) outside the guest's own window. Real-guest tests for the large-value loop and each of the three never-ending shapes show the invocation ends within a stated margin of its window, the next invocation is served and shutdown is clean. A decision record states what the check cannot bound: the one call already running at the deadline, host work already admitted, result handling after settlement, and memory.

## Evidence

Filled at landing: what ran and where its output is.
