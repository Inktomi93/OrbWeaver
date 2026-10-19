---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# semantic-inventory test reds on main

## What

tests/tooling/floor/code-facts/semantic-inventory.test.ts fails on main: 'indexed records round-trip every native partition field and raw reference row in order' (a referenceNames mismatch in the stored partition record), 'native escaped literal names and unresolved specifiers survive indexed storage as exact UTF-16', 'legacy analysis eligibility publishes a new exact generation', and the format 1 to 9 adoption cases, which run 24 to 37 s each. claude-b's 954 lane saw the round-trip red with 954 reverted, and suspects the 955 member-read fold; unconfirmed.

## Why

The native inventory store is the shared fact store every reader depends on; a red round-trip test means stored facts may not equal extracted ones.

## Done when

Each red is traced to its commit (git bisect on the test), fixed at its cause or shown to be a timeout given a measured budget; the round-trip and escaped-name cases pass on main.

## Evidence

Filled at landing: what ran and where its output is.
