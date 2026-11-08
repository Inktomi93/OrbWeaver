---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: security
---

# The server's secret list covers every provider and probe key

## What

ANTHROPIC_API_KEY and the \*\_PROBE_KEY keys are missing from the server's secret list in the env record, so a server that receives them passes them to every child process it spawns.

## Why

A child process such as a plugin host or a tool runner should never inherit a provider key it does not need.

## Done when

Every provider and probe key name is in the secret list, a test spawns a child through the real spawn path with those keys set and sees none of them, and a new provider key name fails a test until it is listed.

## Evidence

Filled at landing: what ran and where its output is.
