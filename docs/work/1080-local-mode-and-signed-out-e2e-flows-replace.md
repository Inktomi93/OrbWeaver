---
kind: work
status: doing
updated: 2026-10-19
priority: P2
area: tests
lane: wt/agent-a2f6cc226f4a38146
plan: test-mirror
---

# Local-mode and signed-out e2e flows replace the remaining flow CTs

## What

Move the 963 move-later cases: the joiner persona ask and its control on the local-mode project, the signed-out analytics alias in a cookie-less context, and the phone config back stack. Add an OIDC e2e project with a mock identity provider so the OIDC pending-join case can leave CT.

## Why

These flows run over real wires that the CT can only stub.

## Done when

Each case runs as an e2e spec, and its CT case is deleted and mapped in reports/review/963-flow-ct-inventory.md.

## Evidence

Filled at landing: what ran and where its output is.
