---
kind: tooling
status: doing
updated: 2026-11-08
priority: P2
area: tooling
lane: wt/agent-a60e00384795f1ed5
plan: test-foundation
---

# doc land unwinds its own writes when it fails

## What

pnpm doc land deletes item files and rewrites indexes before it stages and commits. When a later step fails, such as a git index lock or a refused citation, it leaves the item files deleted in the working tree and the index half-staged, and with --stage a following git commit can go through without the landing.

## Why

A half-applied landing is easy to commit by mistake and hard to clean up by hand, and the guard refuses the obvious restore command.

## Done when

A failed landing leaves the working tree and index exactly as they were, a failed --stage exits non-zero before any write, and tests plant an index lock and a refused citation and prove nothing changed.

## Evidence

Filled at landing: what ran and where its output is.
