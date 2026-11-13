---
kind: tooling
status: open
updated: 2026-11-13
priority: P3
area: security
plan: checked-law
---

# One environment builder serves every inheriting spawn, and a lint refuses a spawn with no env

## What

The tar, tunnel, media and git children and two Workers each inherit the process environment at their call site; the scrub at boot is the only guard. The git mirror test that proves the scrub skips on Windows.

## Why

A spawn added tomorrow inherits whatever the process holds, and nothing fails.

## Done when

Each inheriting spawn takes its environment from one builder, a lint entry refuses a spawn, execFile or Worker call in server source without an explicit env, and the proof runs on Windows as well.

## Evidence

Filled at landing: what ran and where its output is.
