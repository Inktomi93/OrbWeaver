# Orbweaver — greenfield council review (2026-06-25)

> A 5-seat panel each read the ENTIRE doc set in full (no grep) and ruled on whether to sign off before
> scaffolding. **Outcome: unanimous conditional sign-off. No blocks.** This is the durable record of the
> verdicts, the converged conditions, and the big ideas. The committed decisions live in
> `Core-Laws-and-Precedents.md §5`; the implementation-time conditions in `Core-Planning-and-Checklists.md`.

## Verdicts

| Seat                  | Model  | Verdict                      | Headline                                                                                                                                                                                                              |
| --------------------- | ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Skeptic  | Opus   | SIGN-OFF w/ conditions       | "Most disciplined greenfield plan I've reviewed" — intra-server boundaries are _lint, not physics_ until the gates exist                                                                                              |
| AI-Native Visionary   | Sonnet | sound, missing the big swing | "Builds a superb substrate and only **retrieves** from it; the 2026 move is to **synthesize**"                                                                                                                        |
| Executability / DX    | Sonnet | can-scaffold-with-fixes      | 8/11 gates real; 5 pre-scaffold blockers (mostly stale "Open"s the ledger already decided) _(dated verdict — the gate ladder was since finalized at the canonical **13**, `Core-0-Architecture-and-Structure.md` §7)_ |
| Production / Ops      | Sonnet | SIGN-OFF w/ conditions       | single-replica is honest + cleanly seamed; gaps are missing _migration scripts_ + _failure surfaces_                                                                                                                  |
| Product / RP-fidelity | Sonnet | PRODUCT-COMPLETE             | genuine strict-superset (12 wins over ST); one real v1 risk (local-light embed tier)                                                                                                                                  |

## Converged conditions (multiple seats agreed) — all now actioned

1. **Gate suite day-one, blocking** (skeptic). → DECIDED (ledger §5); the _how_ is `Core-Planning-and-Checklists.md`.
2. **Differential oracle is a noun, not a procedure; can't validate memory (a rewrite)** (skeptic + ops). → runbook + fixture spec in `Core-Planning-and-Checklists.md`.
3. **v1 authority-model scope was ambiguous** (skeptic + product). → DECIDED: participant-membership in v1; agent-principal mint deferred (ledger §5).
4. **Stale "Open"s the ledger already closed** (executability). → PURGED (foundation DEFAULT_MODEL, credentials factory, domains.md hub_score/serde/bulk/stats, infra oidc note).
5. **Promote the `contracts/` boot-DAG + add embeddings/search to the leaf order** (executability). → DONE (ledger §4).

## Resolved in docs (Bucket 1 + 2)

- Stale "Open"s purged (above). `core/Tier-5-Entry.md` written (the composition root had no home — skeptic #5).
- `contracts/` boot-DAG + embeddings/search leaf-order → ledger §4.
- AI-native **seam reservations** added (ClipKind/ClipSourceKind/scope; `'world-state'` WorkloadKind; `'observer'` participant kind note; cross-chat scope + stats↔discovery JOIN kept open).
- Decisions committed in ledger §5: v1 authority, local-light = v1 prereq, the 4 swings = reserve-now/build-v2, the `can()` interface, the two gate-formats, the Qwen3-VL concentration risk (owned).

## The big AI-native swings (the "mega-cool" — grounded in existing seams; v2)

1. **World-state as a third substrate kind** — `{{world_state}}` macro + a reconciling workload (relationship/inventory/plot, _what is currently true_). Seam: `knowledge-cluster §9` trackers/clips + `embeddings.store(kind,…)`.
2. **The Narrative Director** — generalize buddy's observe→propose→confirm to a per-chat observer agent that detects drift and proposes WI/steering (never acts). Seam: buddy pattern + guided steering + `smart-arbitrate` + WI verbs.
3. **Cross-chat character coherence** ("persistent self") — synthesize character-level traits from cross-chat digests. Seam: de-pin (identity-keyed) + search's cross-chat character scope.
4. **Engagement-aware preset recommendation** — discovery facets + stats engagement → connection. Pure v2.

The thesis: the architecture builds a superb knowledge substrate and retrieves from it; the swing is to _synthesize_ from it. Budget to keep the swings free = ~5 type declarations + 2 union reservations (done).

## Implementation-time conditions (→ `Core-Planning-and-Checklists.md`)

Gate suite day-one; the oracle runbook+fixture; migration scripts (proposedTags data migration, character_books orphan pre-flight, stats-regroup atomicity); `.credentials-key` boot-probe + warning; fire-and-forget memory-build failure surface; the ~150 "preserve exactly" esoterica → named tests; SSE subscription error-wrapper; `VLLM_DISABLED`; `custom-byo contextWindow`; the local-light embed/rerank tier as a v1 prerequisite.

## Notable wins the council validated (vs SillyTavern)

Tiered memory + cross-chat vector search (5 modes, 2 lenses, CSLS + rerank + BM25) · the rolling-PAIR cache breakpoint (ST pattern + neo's safe-boundary aborts) · per-agent connection · the dynamic capability-descriptor params panel · `runOnEdit` wired · 4-scope world-info · the buddy agent w/ propose-confirm gate · character de-pin + snapshot/restore · proposed-tags round-trip fixed · fully-user-declared BYO backend · import auto-indexes · the single canonical typed card. **The "strict superset" claim holds — conditional on the local-light tier shipping in v1.**
