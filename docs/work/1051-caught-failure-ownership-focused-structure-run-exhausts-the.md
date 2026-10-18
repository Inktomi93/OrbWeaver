---
kind: tooling
status: doing
updated: 2026-10-18
priority: P1
area: tooling
lane: wt/agent-a9106f281b14c346b
plan: test-foundation
---

# caught-failure-ownership focused structure run exhausts the client inventory worker heap

## What

A focused check:structure --check caught-failure-ownership on unmodified main code ends without a verdict: the native inventory worker for packages/client/tsconfig.json hits its 16 GB heap ceiling after about 456 s (SIGABRT, ineffective mark-compacts) with about 65 GB free. Evidence: claude-b lane worktree agent-a4bd93033f54dc368, reports/runs/structure/agent-a4bd93033f54dc368-3487960-2026-10-18T18-22-02-813Z/check-structure.json.

## Why

A gate that cannot complete over the client world gives no verdict, and a standard hosted runner has far less memory than this box.

## Done when

A focused run on the client world completes within the default worker heap, and a focused run's evaluate step stays inside the hosted-runner budget item 965 sets. The cost fix lives in the shared reader and fact queries (965/1002), not in a heap raise or a population cut.

## Evidence

Measured by claude-b's 1049 lane. A single-file focused run (`packages/kit/src/time/index.ts`, 6 markers) took 127.5 s, of which evaluate was 91.4 s; the CLI peaked at 3.1 GB and the semantic-inventory worker at 470 MB over 11 s, in one world. Nine kit files did not finish in 900 s; two client census files finished in 216 s (evaluate 190 s, 4.4 GB). A 298-file run passed 83 minutes without writing an artifact. Cost is roughly linear at about 90 s per file in the CLI evaluate step (reader and native fact queries), separate from the client-world heap exhaustion. Artifacts: lane worktree `agent-a4bd93033f54dc368`, `reports/cb-1049-mine/` and `reports/runs/structure/`.
