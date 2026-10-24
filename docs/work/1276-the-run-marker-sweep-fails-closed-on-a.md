---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tooling
---

# The run-marker sweep fails closed on a sibling process it cannot read

## What

The run-marker sweep in `tooling/src/floor/process/run-marker.ts` finds its marked children by reading each newer same-user process's `/proc/<pid>/environ`. When that file is unreadable (EACCES, as for Chromium's zygote or `ssh`), the sweep refuses, and a `--list` in `tests/e2e/support/project-selection.int.test.ts` exits 2 on a busy box with such a sibling. The rule fails closed by design; the owner decides whether a process whose parent is alive, readable and unmarked may be excluded, since it cannot carry our marker.

## Why

A sweep that refuses on an unrelated sibling blocks the whole run on a shared box.

## Done when

Owner ruling recorded in this item; if excluding is ruled in, the sweep skips an unreadable process whose parent is alive, readable and unmarked, with a test that plants such a process; if ruled out, the refusal names the process and its parent so the operator can act.

## Owner ruling

2026-10-24: exclude. The sweep skips a process whose `/proc/<pid>/environ` is unreadable when its parent is alive, readable and unmarked, since such a process cannot carry the marker. It still refuses when the parent is unreadable or marked.

## Evidence

Filled at landing: what ran and where its output is.
