---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph has a developer surface: profiling, traces, ablation and a dump

## What

The prototype printed per-phase timings and run statistics and read BH\_\* environment switches (why-member, files, axis, tv, param-key and verify-chain traces, literal/escape/twin/spelling ablation). The graph has none of these, and no way to save a build and analyse it again.

## Why

Debugging a graph finding needs the site and rule that assigned each role, and a heap or CPU question needs the checker process profiled too.

## Done when

Graph verbs take --profile (phase wall time, request counts, memo hits, rss, checker getTimingInfo, --profile=cpu|heap through the API debug handlers with the top allocators printed), --why, --files, --trace, --ablate and --dump/--from (a dump names its build time and HEAD and refuses another format); one planted case per flag; options parsed once into a typed object.

## Evidence

Filled at landing: what ran and where its output is.
