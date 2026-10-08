---
kind: tooling
status: doing
updated: 2026-10-08
priority: P1
area: verification
lane: codex/ci-corpus-partitions
---

# Require complete attempt-local parallel corpus qualification

## What

Run independent corpus partitions on separate hosted runners. Compose them with static qualification and retain complete affected or full instrument selection.

## Why

Independent semantic workspaces exceed the memory available for concurrent execution on a standard hosted runner. Partial reruns cannot inherit previous-attempt corpus proof.

## Done when

Every required corpus partition and static generation step succeeds in the same run attempt. Native component selection preserves complete policy and control coverage and refuses incomplete evidence.

## Evidence

Filled at landing: what ran and where its output is.
