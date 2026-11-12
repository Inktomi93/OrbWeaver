---
kind: work
status: doing
updated: 2026-11-12
priority: P2
area: security
lane: wt/agent-a84eabc3e8d8f0a49
plan: checked-law
---

# Identity rulings with no test: blob owner check, forged Host on a loopback peer, one users upsert, raw cookie token never stored

## What

The leg four law census under `reports/law-census` reports that `docs/law/Spine-Identity-and-Auth.md` rules these and no checker holds them: the `/blob/:hash` route checks the owner, a forged Host header on a loopback peer is refused, the users upsert has one home so that entry holds no second one, and the raw session cookie token is never stored. Confirm each absence with two search methods, then close each with an ordinary test through the real HTTP entry or a dependency rule.

## Why

Each is an identity boundary that a refactor can open with every suite still passing.

## Done when

Each ruling has a named checker with a shown red, or the report gives the path of the checker the census missed.

## Evidence

Filled at landing: what ran and where its output is.
