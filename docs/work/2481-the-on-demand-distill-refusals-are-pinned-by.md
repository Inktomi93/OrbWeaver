---
kind: bug
status: doing
updated: 2026-11-11
priority: P3
area: testing
lane: wt/agent-a30ee1d42d1997dfe
---

# The on-demand distill refusals are pinned by no test while its contract header claims they are

## What

The discovery errors contract states that both failure postures of the distill pass are pinned by tests. The batch posture is: a support factory integration test asserts its counts. The on-demand posture is not: neither of its two refusal classes, the reason code behind the name-only refusal, nor the leak-free collapse for a foreign card appears in any test in the repository. The domain's own suite covers the hub math, the hub-score workload, the browse setting, and greeting boundaries — not the distill refusal path at all. The ordering the untested path carries is decisive per its own header: the ownership refusal must resolve before any statement about card content, or the pair of refusals becomes an existence oracle for any card id a stranger can type. Source: reports/codebase-review/units/dom-discovery.md.

## Why

A refusal taxonomy whose whole purpose came out of a cross-tenant sweep runs today pinned only by a header sentence that overstates its coverage. The correct ordering is cheap to pin — a foreign id must answer not-found, an owned name-only card must answer the not-distillable refusal — and a swap of those two statements is exactly the oracle the sweep rejected.

## Done when

One test answers a foreign or absent card id with the not-found collapse, one answers an owned content-less card with the not-distillable refusal, and the ordering claim in the errors header matches a test that can tell the two refusals apart. The header statement about test coverage is true after the change.

## Evidence

Filled at landing: what ran and where its output is.
