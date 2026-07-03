---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed — the stats↔discovery economics/semantics seam (unbuilt tiers)

> **Status: proposed.** Salvaged from the 2026-07 `stats.md` gutting audit. The `stats` domain is BUILT
> (code is the source of truth — `packages/server/src/domain/stats/`); tier 1 of the seam (stats touches
> zero vector tables) is LIVE via the `stats-no-vector-tables` dep-cruiser rule. What remains unbuilt is
> the *discovery-side* of the type-enforced economics/semantics line and two small hardening ideas. The
> DEFERRALS are already owned by **PD-22** (the stats `messages-economics` read) and **PD-40** (the rest
> of the discovery corpus surface, incl. `forgottenGems`/`modelRouting`) in
> `core/Core-Audits-and-Debt.md` — this doc holds only the DESIGN leans that would otherwise be lost, not
> a duplicate deferral row.

The invariant (knowledge-cluster / memory §7 #7): **`discovery` (semantics) and `stats` (economics)
share no tables; discovery computes no usage rollup.** Promoted to `Core-0` §6 partitioning. Tier 1 is
enforced. Tiers 2–3 below are the discovery-side pieces that land when the discovery corpus surface is
built (PD-40) and the stats economics read is built (PD-22).

## Tier 2 — the disjoint `messages` projections (the compile-time half)

The economics columns of `messages` (`tokens_in/out`, `cost_usd`, `cache_*`, `gen_*`, `ttft_ms`,
`context_window`) must be reachable ONLY through a stats-owned economics projection; discovery reads
`messages` through a SEMANTIC projection (`role`/`content`/`model`/`characterId`/`createdAt`) that never
names the economics columns — so a discovery query that SUMs `tokens_out` fails to type-check.

**Lean (the open decision from the old doc, recorded so it isn't re-litigated):**
- The economics-projection **constructor** lives in `domain/stats/persistence/messages-economics.ts`
  (stats-internal; the only shape that carries token/cost/cache/timing columns of a `messages` row).
- The **result shape discovery receives** (a narrowed, already-aggregated economics result — NOT the raw
  row) lives in `@orb/contracts/stats`, so discovery's injected `stats` op can return it without discovery
  ever being able to name the raw economics row.
- **D26 caveat:** economics live on `message_variants`, NOT `messages` — the read MUST be the D26-aware
  read (mirrors PD-22's note in `discovery/contract/service.ts`).

**Proposed lint backstop — `discovery-no-stats-rollups`:** a dep-cruiser rule forbidding
`domain/discovery/**` from importing any of the four rollup tables (`owner_stats` / `character_stats` /
`daily_stats` / `model_stats`). This is CHEAP and could land NOW (independent of PD-22/PD-40) — nothing
structurally stops discovery importing a rollup table today; only the (unbuilt) disjoint-projection
discipline would. Recommend adding it as a forward rule the way `stats-no-vector-tables` already is.

## Tier 3 — the insights gray zone resolves by composition (owned by PD-40)

- `forgottenGems` (revisit candidates): keeps its SEMANTIC ranking (message-volume COUNT + recency) in
  discovery, but its `tokensOut` field comes from `character_stats.tokensOut` via an injected `stats` op —
  never a raw `messages` SUM.
- `modelRouting` (which model per genre): a composition-root wiring — discovery supplies `genre` (its
  `character_summaries` facet), stats supplies the per-`(model)` tallies.
- `themeDrift` / `unusedCharacters`: purely semantic, stay wholly in discovery.

Enforcement: the economics field can only arrive through the injected `stats` op's typed result; the
raw-`messages` economics SUM is unspellable in discovery (tier 2). This whole surface is deferred under
PD-40 — captured here only for the composition shape.

## Hardening idea — the ST-parity validation probe

The `wordCount` `\b\w+\b` parity with SillyTavern is currently covered only by the kit unit test
(`tests/kit/stats-tally/index.test.ts`), which asserts the regex semantics but does NOT compare against a
real ST `stats.json`. A `scripts/probes/stats-validate.ts` probe that runs `reconcileStats` over an
imported ST profile and diffs the four rollups against ST's own `stats.json` would catch a silent
divergence (a regex/`is_user`-split change that unit tests miss). Nice-to-have; no owner yet.

## Not in scope here

The `t-digest`-for-latency idea and the per-author-economics-under-agent-principals question are tracked
at their code seams (`domain/stats/persistence/latency.ts` YAGNI note; the PD-21-confirmed /
FLAG[PD-17] owner-attribution note in `domain/stats/write/rebuild-from-canon.ts`) — not repeated here.
