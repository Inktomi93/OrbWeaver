---
kind: work
status: open
updated: 2026-10-19
priority: P1
plan: test-foundation
---

# The fact store reader batches and dedupes lookups per read session

## What

Floor fact readers issue one SQLite query per key with no batching or per-session dedupe. 1133 measured respell running 142,748 per-pair lookups for chat alone, each re-reading both full shapes; its fix is a private memo in one reader that other consumers do not share.

## Why

N+1 lookups make every consumer pay per key, and per-consumer memos are second copies of one concept; the plan calls for one fact store queried by every caller.

## Done when

The shared reader owns one per-session loader per fact family that collects requested keys, fetches them in batched queries and caches by key for the pinned generation, keeping stale and disposed refusals; 1133's shape memo folds into it; respell and one other heavy consumer show identical output with measured query counts and times before and after.

## Evidence

Filled at landing: what ran and where its output is.
