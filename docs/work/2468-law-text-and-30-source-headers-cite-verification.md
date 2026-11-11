---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: docs
---

# Law text and 30 source headers cite verification gates that D333 deleted as live enforcement

## What

Three gate names were removed with the custom verification system in 821e8f8dff but are still cited as present-tense doors. single-stream-transport: docs/law/Tier-4-Transport.md promises it keeps non-stream routers subscription-free and five transport headers repeat the promise (routers/chat.ts, routers/workloads.ts, routers/automation.ts, stream/sources/workloads.ts, stream/room-sources.ts); the gate is gone, so the one-multiplexed-SSE invariant (ADR 0118) is now ungated while the law says it is not. no-inline-union-redecl: cited in 25 headers across kit/db/contracts/client/ui/server/tooling as the door against re-spelled unions; the live successor rule orb/no-inline-union-alias exists and is enabled (eslint.config.ts:2112, named by Spine-TypeScript-and-Patterns), so only the name is stale. no-raw-clock: cited in seven headers (transport stream/socket-registry.ts, entry compose, kit/time, foundation version, domain/stats, inference retry, client bug-report) as enforcing injected clocks; NO successor rule exists, so the determinism posture is discipline-only while the comments claim a gate. Source: reports/codebase-review/units/server-transport.md.

## Why

The law is the map a cold author trusts to know which mistakes a door catches; a gate citation that survived its gate teaches the next author that the single-stream invariant is checked when nothing checks it, and 25 headers pointing at a deleted rule-name train a habit of citing enforcement that was never re-verified after the tooling deletion. This is the dead-cite shape with a law-text twist: the promise of enforcement is itself the rot.

## Done when

Tier-4 law and the five transport headers either name a live native check for the single-stream rule (an eslint no-restricted-syntax on .subscription( outside stream.ts plus the sanctioned impersonateStream procedure is the obvious spelling) or drop the gate claim and say the invariant is review-enforced. Every no-inline-union-redecl cite is retargeted to orb/no-inline-union-alias. Every no-raw-clock cite is retargeted to the Spine-Testing injection ruling (or a resurrected native rule, if the owner wants a door). ADR bodies stay untouched: they are dated records.

## Evidence

Filled at landing: what ran and where its output is.
