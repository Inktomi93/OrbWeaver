---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed — the stats↔discovery economics/semantics seam (unbuilt tiers)

> **Status: Tiers 1–3 BUILT; only the two hardening ideas remain proposed.** Salvaged from the 2026-07
> `stats.md` gutting audit. Tier 1 (stats touches zero vector tables) is LIVE via the `stats-no-vector-tables`
> dep-cruiser rule. Tier 2 (the stats-owned economics projection, PD-22) + Tier 3 (the two economics-composed
> discovery insights, PD-40) are BUILT — see the tier sections below (code is the source of truth). What
> remains unbuilt: the proposed `discovery-no-stats-rollups` lint backstop + the ST-parity validation probe. The
> DEFERRALS are already owned by **PD-22** (the stats `messages-economics` read) and **PD-40** (the rest
> of the discovery corpus surface, incl. `forgottenGems`/`modelRouting`) in
> `core/Core-Audits-and-Debt.md` — this doc holds only the DESIGN leans that would otherwise be lost, not
> a duplicate deferral row.

The invariant (knowledge-cluster / memory §7 #7): **`discovery` (semantics) and `stats` (economics)
share no tables; discovery computes no usage rollup.** Promoted to `Core-0` §6 partitioning. Tier 1 is
enforced. Tiers 2–3 below are the discovery-side pieces that land when the discovery corpus surface is
built (PD-40) and the stats economics read is built (PD-22).

## Tier 2 — the disjoint `messages` projections (the compile-time half) — **BUILT (PD-22)**

The economics columns of `messages` (`tokens_in/out`, `cost_usd`, `cache_*`, `gen_*`, `ttft_ms`,
`context_window`) must be reachable ONLY through a stats-owned economics projection; discovery reads
`messages` through a SEMANTIC projection (`role`/`content`/`model`/`characterId`/`createdAt`) that never
names the economics columns — so a discovery query that SUMs `tokens_out` fails to type-check.

**As-built (code is the source of truth):**

- The economics projection lives in `domain/stats/persistence/messages-economics.ts` (stats-internal). The
  raw economics ROW shape (`EconomicsRow`/`ModelEconomicsRow`) is MODULE-PRIVATE — never exported — so no
  consumer can name a `tokens_out` column; the file aggregates in SQL and returns only pre-summed results.
  Exposed on `StatsService` as `characterEconomics` + `characterModelEconomics` (NOT tRPC-routed — they are
  the injected ops for discovery).
- The **result shapes discovery receives** — `CharacterEconomics` + `CharacterModelEconomics` (narrowed,
  already-aggregated) — live in `@orb/contracts/stats`, so discovery's injected `stats` op returns them
  without discovery ever naming the raw economics row.
- The discovery SIDE reads `messages` through `domain/discovery/persistence/message-reads.ts`
  (`readForgottenGemCandidates`) — role/createdAt/characterId only, no economics column.
- **D26:** economics live on `message_variants`, NOT `messages` — the read aggregates the SELECTED variant of
  each assistant slot (`messages.selected_variant_id`), so an unselected swipe never double-counts.

**Lint backstop — `discovery-no-stats-rollups`: LANDED (2026-07-13) as a ts-morph STRUCTURE GATE**
(`scripts/check/gates/discovery-no-stats-rollups.ts`), NOT the dep-cruiser rule this doc originally
proposed: a `to: db/schema/stats` path rule is empirically VACUOUS — every `@orb/db` import resolves to
the barrel (`exports "." → src/index.ts`), so the module-path regex can never fire (a probe
`import { ownerStats }` inside discovery cruised green). The gate matches the four rollup table symbols
(`ownerStats`/`characterStats`/`dailyStats`/`modelStats`) at the ImportSpecifier level inside
`domain/discovery/**` — the `no-direct-users-read` mechanism, self-tested by mustFlag/mustPass. (The
sibling `stats-no-vector-tables` dep-cruiser rule shares the same barrel-resolution hole; its real
enforcement is the `vector-scope-derived` gate's import arm.)

## Tier 3 — the insights gray zone resolves by composition — **BUILT (PD-40/PD-22)**

As-built in `domain/discovery/verbs/economics-insights.ts` (`createEconomicsInsights`); the injected ops are
wired at the entry root (`entry/compose/services.ts`: `characterEconomics`/`characterModelEconomics` ←
`stats`).

- `forgottenGems` (revisit candidates): keeps its SEMANTIC ranking (assistant-message-volume COUNT + recency)
  in discovery (`readForgottenGemCandidates`); its `tokensOut`/`costUsd` come from the injected
  `characterEconomics` op (the D26 SELECTED-variant totals) — never a raw `messages` SUM. (Note: as-built the
  economics come from the D26 message-variant aggregation, NOT `character_stats.tokensOut` — the older lean —
  because PD-22 built the `messages-economics` read the task specified.)
- `modelRouting` (which model per genre): discovery maps each character to its `character_summaries.genre`
  and re-groups the injected per-`(character, model)` economics (`characterModelEconomics`) into `(genre,
  model)` rows.
- `themeDrift` / `unusedCharacters`: purely semantic, stay wholly in discovery (built earlier).

Enforcement: the economics fields can only arrive through the injected `stats` op's typed result; the
raw-`messages` economics SUM is unspellable in discovery (tier 2 — the raw row is stats-module-private).

## Hardening idea — the ST-parity validation probe

The `wordCount` `\b\w+\b` parity with SillyTavern is currently covered only by the kit unit test
(`tests/kit/stats-tally/index.test.ts`), which asserts the regex semantics but does NOT compare against a
real ST `stats.json`. A `scripts/probes/stats-validate.ts` probe that runs `reconcileStats` over an
imported ST profile and diffs the four rollups against ST's own `stats.json` would catch a silent
divergence (a regex/`is_user`-split change that unit tests miss). Nice-to-have; no owner yet.

## Not in scope here

The `t-digest`-for-latency idea and the per-author-economics-under-agent-principals question are tracked
at their code seams (`domain/stats/persistence/latency.ts` YAGNI note; the PD-21-confirmed /
FLAG\[PD-17] owner-attribution note in `domain/stats/write/rebuild-from-canon.ts`) — not repeated here.
