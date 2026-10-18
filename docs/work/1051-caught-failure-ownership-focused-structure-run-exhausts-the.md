---
kind: tooling
status: open
updated: 2026-10-18
priority: P1
area: tooling
plan: test-foundation
---

# caught-failure-ownership focused structure run exhausts the client inventory worker heap

## What

A focused check:structure --check caught-failure-ownership on unmodified main code ends without a verdict: the native inventory worker for packages/client/tsconfig.json hits its 16 GB heap ceiling after about 456 s (SIGABRT, ineffective mark-compacts) with about 65 GB free. Evidence: claude-b lane worktree agent-a4bd93033f54dc368, reports/runs/structure/agent-a4bd93033f54dc368-3487960-2026-10-18T18-22-02-813Z/check-structure.json.

## Why

A gate that cannot complete over the client world gives no verdict, and a standard hosted runner has far less memory than this box.

## Done when

The focused run completes over the client world within the default worker heap on this box, with peak memory measured, and the cost fix lives in the shared inventory reader (965/1002), not in a heap raise or a population cut.

## Evidence

Filled at landing: what ran and where its output is.
