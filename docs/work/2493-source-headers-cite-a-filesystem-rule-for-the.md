---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: server
lane: wt/agent-a30ee1d42d1997dfe
---

# Source headers cite a filesystem rule for the domain tier that no enforcement defines

## What

A comment in the profile-import collector and a comment in the plugin contract justify not touching the filesystem by citing a dashed policy name as the enforcing rule, in present tense. The name resolves nowhere: it appears in no dependency rule, lint rule, or format config, and it was never in the pre-deletion gates ledger either — history shows the name entering the tree in prose only, from its first cited day. No other rule forbids Node filesystem modules below the domain tier; the nearest rule guards the browser mount, a different axis. The constraint itself is real placement law — external I/O belongs in infrastructure adapters — and the injected port design honors it; only the enforcement named in the parentheses was never built.

## Why

A parenthetical naming an enforcement teaches authors that a machine will catch the violation. If the door never existed, the cite silently teaches the wrong enforcement model — the rule actually stands on placement law and the shape of the injected port, which is what a cold author needs to know. The closed dead-gate census enumerated names from the deleted gates ledger; this name entered through prose only and bypassed that ledger, so a name-enumeration over the ledger alone is a lower bound.

## Done when

Each citing comment names an enforcement that resolves in a live config or states the real guarantee (the placement law and the injected port); no comment claims a rule that no config defines, and the census method note records that prose-only policy names exist outside the deleted ledger.

## Evidence

Filled at landing: what ran and where its output is.
