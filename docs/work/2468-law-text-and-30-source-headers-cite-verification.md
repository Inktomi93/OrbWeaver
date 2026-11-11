---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: docs
---

# Law text and 30 source headers cite verification gates that D333 deleted as live enforcement

## What

Three gate names were removed with the custom verification system in 821e8f8dff but are still cited as present-tense doors. single-stream-transport: docs/law/Tier-4-Transport.md promises it keeps non-stream routers subscription-free and five transport headers repeat the promise (routers/chat.ts, routers/workloads.ts, routers/automation.ts, stream/sources/workloads.ts, stream/room-sources.ts); the gate is gone, so the one-multiplexed-SSE invariant (ADR 0118) is now ungated while the law says it is not. no-inline-union-redecl: cited in 25 headers across kit/db/contracts/client/ui/server/tooling as the door against re-spelled unions; the live successor rule orb/no-inline-union-alias exists and is enabled (eslint.config.ts:2112, named by Spine-TypeScript-and-Patterns), so only the name is stale. no-raw-clock: cited in seven headers (transport stream/socket-registry.ts, entry compose, kit/time, foundation version, domain/stats, inference retry, client bug-report) as enforcing injected clocks; NO successor rule exists, so the determinism posture is discipline-only while the comments claim a gate. Fourth instance from the entry unit: docs/law/Tier-5-Entry.md invariant 1 names compose-wiring-only as the door over per-call decisions in compose modules; it died in the same deletion, and no native replacement carries that name (the ruling itself survives in the invariant text). Source: reports/codebase-review/units/server-transport.md and units/server-entry.md.

FULL CENSUS (supersedes the enumeration above — the cluster is not four names, it is thirty-nine): the last active-gates ledger before the deletion (docs/law/Core-Enforcement-Active-Gates.md at the parent of 821e8f8dff) lists 122 gate names; 39 of them appear in NO live enforcement config or tooling rule today (bare-name checked across eslint.config.ts, .dependency-cruiser.ts, biome.json, knip.ts, tooling/src/eslint) yet are still cited as present-tense doors by many files. The law layer is the worst offender: seven LAW docs cite dead gates — Core-0-Architecture-And-Structure.md (package-deep-import), Tier-4 (single-stream-transport, no-inline-union-redecl), Tier-5 (compose-wiring-only), UI-Density-Law (density-tier), client-architecture-lockdown (suppressions), motion-and-animation-guide (rest-transform-grid). Highest-volume source cites: no-inline-types (many files), no-inline-union-redecl (21), verb-naming (12), own-tables-only (9), test-determinism (9), json-column-write-parity (6), single-stream-transport and bus-producer-coverage and density-tier and duplicate-action-doors (5 each). D333's ruling that these gates die is not contested — the rot is that the citations survived: headers and law still promise doors that review alone now holds. Full per-name path list: reports/codebase-review/dead-gate-census.txt (name blocks under == markers).

## Why

The law is the map a cold author trusts to know which mistakes a door catches; a gate citation that survived its gate teaches the next author that the single-stream invariant is checked when nothing checks it, and 25 headers pointing at a deleted rule-name train a habit of citing enforcement that was never re-verified after the tooling deletion. This is the dead-cite shape with a law-text twist: the promise of enforcement is itself the rot.

## Done when

Tier-4 law and the five transport headers either name a live native check for the single-stream rule (an eslint no-restricted-syntax on .subscription( outside stream.ts plus the sanctioned impersonateStream procedure is the obvious spelling) or drop the gate claim and say the invariant is review-enforced. Every no-inline-union-redecl cite is retargeted to orb/no-inline-union-alias. Every no-raw-clock cite is retargeted to the Spine-Testing injection ruling (or a resurrected native rule, if the owner wants a door). The Tier-5 invariant cites whatever native check now covers compose per-call decisions, or states review-enforcement. For the full 39-name census: sweep the path list, retarget every cite to its native successor where one exists under a different name, otherwise rephrase to the surviving ruling (spine/law section) or drop the door claim; the seven law docs go first. ADR bodies stay untouched: they are dated records.

## Evidence

Census method: extracted every backticked gate name from the pre-deletion gates ledger (git show 821e8f8dff^:docs/law/Core-Enforcement-Active-Gates.md), dropped names still present verbatim in any enforcement config or tooling rule, then counted live citing files under packages/ and docs/law/. Output: reports/codebase-review/dead-gate-census.txt.
