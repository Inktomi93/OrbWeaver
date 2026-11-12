---
kind: decision
status: open
updated: 2026-11-12
priority: P3
area: security
plan: authorization-and-visibility
---

# An admin acting on the owner's workload gets a refusal that matches what the admin can see

## What

The workloads verbs answer not found when a delegated admin acts on an owner's row, while the admin can still read that row; the admin verbs answer a visible owner target with the coded cannot-modify-owner refusal.

## Why

Not found on a row the caller can read is untrue on the wire.

## Done when

Ruled together with the read question: either the owner's workloads are hidden from an admin and not found is true, or the verbs answer the coded refusal, and the owner workloads test asserts the ruled code.

## Evidence

Filled at landing: what ran and where its output is.
