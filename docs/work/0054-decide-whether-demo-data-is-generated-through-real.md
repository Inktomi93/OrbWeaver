---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: server
---

# Decide whether demo data is generated through real sessions or stays a synthetic pack

## What

The demo seeder replays committed static transcripts and a hand-written board. It generates nothing.
`docs/design/demo-seeding-rebuild.md` prices the alternative: build each demo through the real session,
turn and import verbs. That needs machinery outside the seeder. The owner rules one outcome:

- Real. Generate the demos through the real lifecycle, so derived data and export round trips are real.
- Synthetic. Keep a synthetic pack and state its limits.

## Why

Synthetic demo data can hide lifecycle defects that a real session would show. The real way needs new
machinery.

## Done when

The ruling is recorded. For real, the demos are generated through the actual verbs, and a test covers an
export round trip. For synthetic, the seeder header states the limits.

## Evidence

Filled at landing: what ran and where its output is.
