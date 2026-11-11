---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: docs
lane: wt/agent-a30ee1d42d1997dfe
---

# Two auth law docs promise a loopback-only owner-fallback the ruled knob widened

## What

docs/law/Tier-3-Infra.md ("The owner-fallback gate reads the raw LOOPBACK TCP peer") and Spine-Identity-and-Auth.md invariant 7 describe ownerFallbackAllowed as true iff the socket peer is loopback with a two-argument signature. The shipped predicate takes a third trustedPeers set (packages/server/src/infra/auth/dispatch.ts:71) wired from config.fallbackTrustedPeers — the AUTH_FALLBACK_TRUSTED_PEERS widening ruled by ADR 0255. Both law docs were last updated after that ruling and kept the old sentence; the code barrel (infra/auth/index.ts:32-34) already carries the correct admission set. Neither doc states the ruled loopback-only exceptions (healthz per ADR 0076, the first-run claim, the owner-claim proof per D258), so a cold reader cannot tell the split is deliberate. Source: reports/codebase-review/units/server-infra-core.md F1.

## Why

The admission set of the security boundary is stated false in the tier law that reviewers and lanes read before touching auth; prose shaped like the pre-knob ruling reads as a ruling the knob never amended.

## Done when

Both law sentences carry the widened admission set with its empty-default equivalence and cite ADR 0255; each names the three call sites that stay loopback-only and their rulings. Zero code change.

## Evidence

Filled at landing: what ran and where its output is.
