---
kind: work
status: open
updated: 2026-11-07
priority: P2
area: testing
plan: test-foundation
---

# Pin owner-derived metadata at the actual Anthropic wire boundary

## What

Pin owner-derived metadata at the wire boundary in tests/inference/roles/side-gen.int.test.ts and tests/inference/backends/anthropic-messages/chat-wire.int.test.ts. docs/plans/test-foundation/finding-triage.md holds the evidence.

## Why

`AF3-FSEC-Q0005`: An arbitrary string assertion accepts a raw owner ID or a constant despite the producer digest contract.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-FSEC-Q0005`: Raw-ID and constant substitutions fail. Known vectors or distinct real owners establish derivation. Preserve the geography assertion and public hash-domain semantics.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
