# Orbweaver — `stats`: turn economics (tokens · cost · cache · timing), zero vectors

> **Status: planning (authoritative detail).** `stats` owns ALL usage economics — the four per-owner
> rollup tables (`owner_stats` · `character_stats` · `daily_stats` · `model_stats`), the read service
> (the tRPC `stats.*` router's single delegation target), and the rollup-maintenance write substrate
> (the live per-canon-write upsert + the full reconcile-from-canon rebuild). It is a **read/write split**
> (CQRS-ish): rollups are kept LIVE on the chat send path, the service is read-only, and percentiles are
> computed ON READ. The defining change from neo-tavern: the stats domain is already clean (zero vector
> tables, confirmed) — the job here is to make the **stats↔discovery line type-enforced** rather than
> prose-enforced, and to land the `_shared/stats-tally.ts` three-way split correctly. Authoritative
> upstream: `knowledge-cluster.md` §7 (the economics-vs-semantics line + invariant #7) + §8 (ownership);
> `_FANOUT-BRIEF.md` §4 (the **stats** pain entry — "economics only, zero vector tables, but the line to
> discovery is prose-only not type-enforced") + §7.4 (types one-home) + §7.5 (string-union dispatch);
> `reports/shared-dissolution.md` §1/§4/§5/§7 (the `stats-tally` split — CITE, don't re-derive);
> `structure.md` §4 (the 8-slot template) + §6 (partitioning: "turn economics → `stats`, zero vector
> tables") + §7 (the gates).

---

## What this domain owns

- **The four rollup tables** — `owner_stats` (per-user global totals, PK `ownerId`), `character_stats`
  (per-`character`, one row per character), `daily_stats` (per-`(owner, day)` timeseries, WIDE format),
  `model_stats` (per-`(owner, model, provider)` generation provenance). All economics + behavior counts;
  **no vector column anywhere**. In neo-tavern these are `db/schema/stats.ts`; in orbweaver
  `@orb/db/schema/stats.ts` (the name is already honest — keep it). **Ownership stamp (ledger D23):**
  `owner_stats`/`daily_stats`/`model_stats` KEEP `ownerId` — they're parentless per-user aggregates (owner ×
  day/model/—), `ownerId` is the row's own key. **`character_stats` DROPS `ownerId`** — it has a single
  owning parent (the character), so owner is reachable by one FK (`characterId → characters.ownerId`); the
  per-owner reads scope via `characterId ∈ {my characters}` (the `leaderboard`/`character` verbs join
  `characters`). Keyed on `characterId` (one row per character).
- **The read service** (`StatsService`, 12 verbs) — thin projections of the live rollups + read-layer
  derived rates (`reasoningRate`, `throughputTps`, `cacheHitRate`, `avgSwipeDepth`, `swipeRate`,
  `avgReplyWords`). The tRPC `stats.*` router's single delegation target; `ownerId` is ALWAYS
  `ctx.userId`/`principal.userId`, never input.
- **The on-read percentile engine** — `latency` (TTFT/gen `avg·p50·p90`), `activityHeatmap`
  (day-of-week × hour-of-day), `momentum` (per-character attention shift across the two most-recent
  active months), `personaUsage` (live chat-level GROUP BY). These can't ride the additive `+=` write
  path (a percentile / hour-axis / month-window isn't mergeable), so they're **bounded per-entity scans
  over canon `messages`** at read time.
- **The live write path** — `applyStatsDelta(batch, db, delta)`: turns a per-canon-write `StatsDelta`
  into UPSERT-increment statements for the four tables, enqueued into the SAME `db.batch()` as the canon
  write so the rollups stay fresh with no rebuild. Injected into the **chat** composition root (never a
  sideways import). NOT a service verb.
- **The full rebuild** — `reconcileStats(db, {ownerId?, signal?})`: the memory-bounded streaming
  recompute of all four tables from canon (messages + variants + chats), the source of truth the drift
  test asserts the live deltas match byte-for-byte. The backfill / post-import settle / admin
  drift-repair path (the `reconcile-stats` workload). NOT a service verb.

This domain does **not** own: the **`StatsDelta` / `ApplyStatsDelta` wire types** (those are
`@orb/contracts/stats` — the chat↔stats contract); the **tally primitives** `wordCount` / `utcDay` /
`modelKey` (those are `@orb/kit/stats-tally` — pure, isomorphic, shared so the live delta can't drift
from reconcile); the **per-canon-write delta *math*** (`messageDelta` / `variantDelta` /
`chatCreatedDelta` — those read chat's own canon row shapes and live in `domain/chat/engine/`; they
*produce* the `StatsDelta` this domain *consumes*); the **canon tables** `messages` / `message_variants`
/ `chats` (it reads them; `chat` owns the writes); any **vector / semantic table** (`character_summaries`,
`theme_clusters`, `chat_digests`, embeddings — those are `discovery` / `embeddings` / `memory`); the
tRPC wire layer (`transport/trpc/routers/stats.ts`); the workload dispatch (`transport/jobs` +
`workloads`).

---

## The read/write split (load-bearing — CQRS-ish)

Two paths write the rollups; one path reads them. Both writers MUST produce identical numbers.

| Path | What | Where | Trigger |
|---|---|---|---|
| **Live delta** | `applyStatsDelta` upserts `col = col + excluded.col` into the SAME batch as each canon write | `domain/stats/write/apply-delta.ts`; injected into chat | every chat send / edit / fork / delete |
| **Reconcile** | `reconcileStats` streams canon → atomic per-owner `delete ×4 + chunked inserts` | `domain/stats/write/rebuild-from-canon.ts` | `reconcile-stats` workload (backfill / import settle / drift-repair) |
| **Read** | thin projections + read-derived rates; percentiles/heatmap/momentum on-read | `domain/stats/persistence/` + `verbs/` | tRPC `stats.*` |

**The correctness contract (the drift gate):** `applyStatsDelta` over a turn's canon change MUST equal a
fresh `reconcileStats` rebuild over the same canon, column-for-column. This is made *structural* (not
merely test-enforced) by both writers importing the ONE `@orb/kit/stats-tally` — a tweak to `wordCount`
or `utcDay` lands in both paths at once. The drift test is the backstop, not the only guard.

**Post-pivot consequences (preserve):** rollups are always fresh, so `freshness.stale` is **always
false** and there is **no user-facing "compute now"** affordance — drift-repair is the admin reconcile
workload. Latency percentiles are **never stored** (they moved on-read in the Stage-3 pivot). There is
**no custom error class** — every verb returns data or `null` for an absent rollup.

---

## The stats↔discovery line (the type-enforced seam — the core design question)

`knowledge-cluster.md` invariant #7: *"`discovery` (semantics) and `stats` (economics) share no tables;
discovery computes no usage rollup."* In neo-tavern this held **only by prose** (a comment + a 2026-06-16
deletion), with a **residual gray zone**: `corpus/insights.ts` reads raw `messages` for
economics-flavored aggregates (`forgottenGems` SUMs `tokens_out`; `modelRouting` tallies per-model
message volume). Orbweaver makes the line RED at compile/lint, three ways:

1. **`stats` touches no vector table** — `StatsContext` carries only the canon tables (`messages`,
   `message_variants`, `chats`, `characters`, `personas`) + the four rollup
   tables. *Enforcement: lint-time — dep-cruiser `stats-no-vector-tables`: `domain/stats/**` may not
   import the embeddings schema namespace (`character_embeddings` / `image_embeddings` / `chat_digests`
   / `chat_segments` / `theme_clusters`) or the `search` / `embeddings` / `discovery` front doors.*

2. **`discovery` computes no usage rollup** — the economics columns of `messages` (`tokens_in`,
   `tokens_out`, `cost_usd`, `cache_read_tokens`, `cache_write_tokens`, `gen_started`, `gen_finished`,
   `ttft_ms`, `context_window`) are reachable ONLY through a stats-owned **economics projection** of the
   `messages` row; `discovery` reads `messages` through a **semantic projection**
   (`role`/`content`/`model`/`characterId`/`createdAt`) that does not name the economics columns. A
   discovery query that SUMs `tokens_out` then fails to type-check — the column isn't on the shape it can
   see. *Enforcement: compile-time — two disjoint row projections (the economics one in
   `@orb/contracts/stats` or `domain/stats/persistence/`, constructed only by stats persistence; the
   semantic one in `domain/discovery/persistence/`). Lint backstop: dep-cruiser `discovery-no-stats-rollups`
   (discovery imports none of the four rollup tables).*

3. **The insights gray zone resolves by composition, not co-location** — `forgottenGems` (revisit
   candidates) keeps its *semantic* ranking (message-volume COUNT + recency) in discovery, but its
   `tokensOut` field is sourced from `character_stats.tokensOut` via an injected `stats` op, not a raw
   `messages` SUM. `modelRouting` (which model per genre) becomes a composition root wiring: discovery
   supplies `genre` (its `character_summaries` facet), stats supplies the per-`(model)` tallies. The
   purely-semantic insights (`themeDrift`, `unusedCharacters`) stay wholly in discovery. *Enforcement:
   compile-time — the economics field can only arrive through the injected `stats` op's typed result; the
   raw-`messages` economics SUM is unspellable in discovery (see #2).*

---

## The `_shared/stats-tally.ts` three-way split (CITE — `reports/shared-dissolution.md`)

`reports/shared-dissolution.md` §7.2 **refines the brief** (which filed the whole file "own feature
stats"): the file SPLITS by nature. A single feature home would force an illegal `chat → stats` sideways
import at runtime, because chat builds deltas every turn.

| `_shared/stats-tally.ts` export | Nature | Orbweaver home | Why |
|---|---|---|---|
| `wordCount`, `utcDay`, `modelKey` | pure, isomorphic, zero-I/O | `@orb/kit/stats-tally` | both the chat delta builders AND `reconcileStats` import them at runtime → one home so the live delta can't drift from reconcile; ST `\b\w+\b` parity |
| `StatsDelta`, `ApplyStatsDelta` | cross-boundary wire type | `@orb/contracts/stats` | the chat↔stats contract: chat *produces* a `StatsDelta`, stats *consumes* it; `ApplyStatsDelta` is the injected-op signature |
| the apply-delta *impl* (the upsert that touches the stats schema) | domain feature | `domain/stats/write/apply-delta.ts` | it writes the four rollup tables → must live in stats; injected into chat's composition root |

The chat-side **builders** (`messageDelta` / `variantDelta` / `chatCreatedDelta`,
`domain/chat/engine/stats-delta.ts`) are NOT part of this split — they read chat's canon row shapes
(`MessageLike` / `VariantLike`) and emit `StatsDelta`. They are chat-domain; they import
`@orb/kit/stats-tally` + `@orb/contracts/stats`, never `domain/stats`.

---

## The 8-slot layout

```
domain/stats/
├── index.ts                FRONT DOOR — re-exports the read service + view types + the two standalone
│                           write fns (applyStatsDelta, reconcileStats). The wire types (StatsDelta,
│                           ApplyStatsDelta) are NOT re-homed here — they live in @orb/contracts/stats.
├── service.ts              COMPOSITION ROOT — createStatsService(db); wires the three verb bundles. ZERO logic.
├── context.ts              DI BUNDLE — explicit StatsContext interface (not ReturnType<>). READ-only:
│                           wraps the persistence reads. The write path is NOT in this context.
├── contract/
│   ├── service.ts          StatsService interface (12 read verbs) — read THIS to know everything the read side does
│   ├── params.ts           LeaderboardSort (string-union) · LatencyScope (discriminated union)
│   ├── views.ts            every *View / *Row / *Stats wire shape: OwnerStatsView, CharacterStatsView,
│   │                         LeaderboardRow, DailyPoint, ModelStatRow, StatsFreshness, PersonaUsageRow,
│   │                         TemporalStats, WrappedSummary, ActivityHeatmap, CharacterMomentum,
│   │                         LatencyStats, ExtraStats, MomentumRow
│   └── (no errors.ts)      stats has NO typed error — verbs return data or null (documented choice)
├── verbs/
│   ├── overview.ts         owner-grain hero (rollup + on-read owner latency)
│   ├── character.ts        single character (one row per character) + on-read character latency
│   ├── leaderboard.ts      per-character rows, sortable (assistantTurns | totalGenTimeMs | swipes | lastActivityAt)
│   ├── timeseries.ts       daily points over [from,to]
│   ├── by-model.ts         per-(model,provider) usage + on-read latency + distinct-character "reach"
│   ├── freshness.ts        computedAt + hasData (stale is always false post-pivot)
│   ├── persona-usage.ts    live per-persona usage (cheap chat-level GROUP BY, always fresh)
│   ├── wrapped.ts          the shareable "your RP in numbers" headline
│   ├── temporal.ts         streaks / active days / busiest day / day-of-week
│   ├── activity-heatmap.ts day-of-week × hour-of-day (on-read; daily_stats has no hour axis)
│   ├── momentum.ts         rising / falling between the two most-recent active months (on-read)
│   └── latency.ts          on-read TTFT/gen percentiles for the entity in view (owner|character|model)
│                           (neo-tavern groups these as rollups.ts/activity.ts/latency.ts — the §4
│                            template is one verb per file; verb-naming gate)
├── persistence/
│   ├── rollups.ts          the rollup projections + read-derived rates; cross-read composition
│   │                         (readWrapped→readOverview, readByModel→readModelLatencies) lives HERE —
│   │                         persistence is the one layer where same-layer calls are legal
│   ├── activity.ts         readActivityHeatmap + readCharacterMomentum (bounded canon scans)
│   ├── latency.ts          readLatency · readModelLatencies · modelLatencyKey (the percentile engine)
│   └── messages-economics.ts  the stats-only ECONOMICS projection of a `messages` row (the type-enforced
│                              seam in §"stats↔discovery line"; the only shape carrying token/cost/cache/
│                              timing columns of messages)
├── substrate/
│   ├── rates.ts            div, reasoningRate, deriveExtra — pure read-layer rate math (no I/O)
│   └── percentiles.ts      percentiles(arr) — pure avg/p50/p90 over a float array (no I/O)
└── write/                  the rollup-MAINTENANCE substrate (the write half of the read/write split —
    │                       NOT service verbs; exported standalone via the front door)
    ├── apply-delta.ts          applyStatsDelta — per-canon-write upsert (injected into chat)
    └── rebuild-from-canon.ts   reconcileStats — full streaming rebuild (the reconcile-stats workload)
```

**Why `write/` is a named subsystem, not `verbs/`:** the two write fns are not `StatsService` verbs (the
read interface). They're the maintenance half of the CQRS split, called from chat (injected) and the
workload runner — never from the read service. Keeping them in a named subsystem (the §4 escape valve)
makes the read/write boundary visible in the tree.

---

## Verbs (the `StatsService` interface)

```typescript
StatsService = {
  // Rollup-backed reads (thin projections + read-derived rates)
  overview(ownerId): Promise<OwnerStatsView | null>          // null = no rollup row yet
  character(ownerId, characterId): Promise<CharacterStatsView | null>
  leaderboard(ownerId, opts?: { sort?, limit? }): Promise<LeaderboardRow[]>   // limit≤200, default 50
  timeseries(ownerId, opts?: { from?, to? }): Promise<DailyPoint[]>           // YYYY-MM-DD window
  byModel(ownerId, opts?: { limit? }): Promise<ModelStatRow[]>                // + on-read latency + reach
  freshness(ownerId): Promise<StatsFreshness>                                 // stale ALWAYS false
  personaUsage(ownerId): Promise<PersonaUsageRow[]>                           // live GROUP BY (not rolled up)
  wrapped(ownerId): Promise<WrappedSummary | null>
  temporal(ownerId): Promise<TemporalStats>

  // On-read analytics (bounded canon scans — not rollup-backed)
  activityHeatmap(ownerId): Promise<ActivityHeatmap>          // day-of-week × hour-of-day
  momentum(ownerId, limit?): Promise<CharacterMomentum>       // rising/falling vs prior active month
  latency(ownerId, scope: LatencyScope): Promise<LatencyStats> // TTFT/gen percentiles; owner|character|model
}
```

**`overview`/`character`/`byModel` fuse rollup + on-read latency:** the rollup carries the additive
columns; `latency` (a separate bounded scan) is spread in at read time. If the percentile read path is
ever consolidated with the rollup read, latency must stay a distinct scan — it can't be `+=`-maintained.

**`personaUsage` is live, not rolled up:** it's a cheap chat-level GROUP BY (persona is "used" when it's
a chat's active OR pinned persona), so a just-created persona shows immediately — unlike the precomputed
character/model rollups. Do not fold it into the write path.

---

## Public surface (`index.ts`)

```typescript
// Read service + factory
export { createStatsService } from './service'
export type { StatsService } from './contract/service'

// Params
export type { LatencyScope, LeaderboardSort } from './contract/params'

// View types (what the client receives)
export type {
  OwnerStatsView, CharacterStatsView, LeaderboardRow, DailyPoint, ModelStatRow,
  StatsFreshness, PersonaUsageRow, TemporalStats, WrappedSummary,
  ActivityHeatmap, CharacterMomentum, LatencyStats,
} from './contract/views'

// The standalone write substrate (NOT service verbs — injected / workload-driven)
export { applyStatsDelta } from './write/apply-delta'
export { reconcileStats, type ReconcileStatsResult } from './write/rebuild-from-canon'
```

**`StatsDelta` and `ApplyStatsDelta` are NOT re-exported here.** In neo-tavern `index.ts` re-exports them
(and `modelKey`/`utcDay`/`wordCount`) from `_shared/stats-tally` as a convenience. In orbweaver they live
in `@orb/contracts/stats` (the wire types) and `@orb/kit/stats-tally` (the primitives); chat and the
composition root import them from there directly — no double-homing through the stats front door.

---

## Movement table

| Unit | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `_shared/stats-tally.ts` — `wordCount`, `utcDay`, `modelKey` | → `kit` | `@orb/kit/stats-tally` | Pure, isomorphic, zero-I/O; imported at runtime by BOTH chat's delta builders AND `reconcileStats` → one home makes "live delta == reconcile" structural, not just test-enforced. ST `\b\w+\b` parity. | resolve-time: `@orb/kit` is the bottom of the cake; `kit-purity` gate (no domain/Node/I/O import) |
| `_shared/stats-tally.ts` — `StatsDelta`, `ApplyStatsDelta` types | → `contracts` | `@orb/contracts/stats` | Cross-boundary wire: chat produces `StatsDelta`, stats consumes it; a feature home forces an illegal chat→stats sideways import. | resolve-time: `@orb/contracts` is a declared dep of both; `domain-no-cross-feature` would fire on a chat→stats import |
| `_shared/stats-tally.ts` — the apply-delta upsert impl | stays domain feature | `domain/stats/write/apply-delta.ts` | It writes the four rollup tables → must live in stats. Injected into chat's composition root. | resolve-time: chat receives it as `ChatServiceDeps.applyStatsDelta` (typed `ApplyStatsDelta`) |
| `domain/stats/persistence/rollups.ts` + `activity.ts` + `latency.ts` | stays domain feature | `domain/stats/persistence/` (unchanged) | Read queries + cross-read composition; persistence is the one layer where same-layer calls are legal. | resolve-time (same package) |
| `domain/stats/verbs/rollups.ts` (9 reads in one file) | **split** → `verbs/` | `verbs/overview.ts` · `character.ts` · `leaderboard.ts` · `timeseries.ts` · `by-model.ts` · `freshness.ts` · `persona-usage.ts` · `wrapped.ts` · `temporal.ts` | One verb per file per the §4 template. | lint-time: `verb-naming` gate |
| `domain/stats/verbs/activity.ts` (2 reads) | **split** → `verbs/` | `verbs/activity-heatmap.ts` · `verbs/momentum.ts` | Same split. | lint-time: `verb-naming` gate |
| `domain/stats/verbs/latency.ts` | stays domain feature | `domain/stats/verbs/latency.ts` | Already one verb. Path keeps. | resolve-time |
| `persistence/rollups.ts` — `deriveExtra`, `div`, `reasoningRate` (pure rate math) | → `substrate/` | `domain/stats/substrate/rates.ts` | Pure read-layer math, zero I/O; belongs in substrate not mixed into the query file. | lint-time: `feature-structure` (pure helpers in substrate/) |
| `persistence/latency.ts` — `percentiles(arr)` (pure) | → `substrate/` | `domain/stats/substrate/percentiles.ts` | Pure float-array math; substrate. `readLatency`/`readModelLatencies`/`modelLatencyKey` (DB-bound) stay in persistence. | lint-time: `feature-structure` |
| `context.ts` — `StatsContext = ReturnType<typeof createStatsContext>` | stays domain feature | `domain/stats/context.ts` top — explicit `export interface StatsContext` | The inferred shape is invisible at a glance; the explicit interface matches the template. | lint-time: `no-inline-types` / `types-in-contract` |
| `db/schema/stats.ts` — the four rollup tables | → `db` (path keeps honest name) | `@orb/db/schema/stats.ts` | Schema file is already named for the producer, not a consumer (unlike `db/schema/search.ts`). Move with the cake; no rename needed. | resolve-time: `@orb/db` schema move; `tsc` flags broken importers |
| `db/schema/stats.ts` — economics columns of the rollups + the `messages` economics columns | stays, but gains a stats-only projection | `@orb/contracts/stats` (economics row shape) + `domain/stats/persistence/messages-economics.ts` (the constructor) | The type-enforced stats↔discovery seam: token/cost/cache/timing columns of `messages` are reachable only through this projection; discovery's `messages` projection omits them. | compile-time: disjoint row projections; lint backstop `discovery-no-stats-rollups` |
| `corpus/verbs/insights.ts` — `forgottenGems` `SUM(tokens_out)` (economics-flavored over raw messages) | **resolve gray zone** → stats-sourced | discovery keeps the verb; `tokensOut` comes from `character_stats.tokensOut` via an injected `stats` op | The revisit ranking (message volume + recency) is semantics; the token figure is economics — it must come from the stats rollup, not a raw `messages` SUM. | compile-time: the economics column is unspellable in discovery's `messages` projection |
| `corpus/verbs/insights.ts` — `modelRouting` (per-model message tally × genre) | **resolve gray zone** → composition | discovery supplies `genre` (its facet); stats supplies per-`(model)` tallies; wired at the composition root | A genuine cross-domain JOIN (semantic facet × economics provenance) → a composition, not a discovery-owned raw aggregate. | resolve-time: injected `stats` op; `domain-no-cross-feature` backstop |
| `corpus/verbs/insights.ts` — `themeDrift`, `unusedCharacters` (purely semantic) | stays in discovery | `domain/discovery/verbs/` | No economics; wholly semantics (theme assignments / library catalog). | resolve-time |
| `write/apply-delta.ts` + `rebuild-from-canon.ts` — inline `as BatchItem<"sqlite">` casts | wire to db-kit helper | `@orb/db/kit` (`batchMany` / `batchStmt`) | The ~59 inline `BatchItem` casts on the chat send/persist path bypass the existing batch helper (escape-hatch cluster #1). Both stats writers commit batches → use the db-kit batch helper. | resolve-time: `@orb/db/kit` per `reports/shared-dissolution.md` §3 |
| `write/*` — `newTypeId(ID_PREFIX.characterStat | dailyStat | modelStat)` | → `kit` | `@orb/kit/ids` | Pure TypeID mint; the canonical kit case (446 importers). | resolve-time |
| `write/rebuild-from-canon.ts` — `chunkRows` / `rowsPerInsert` | → `db` | `@orb/db` (`insert-chunk`) | libSQL bound-variable chunking is a db-layer concern. | resolve-time |
| `verbs/rollups.ts` + `verbs/activity.ts` — inline `opts: { sort?; limit? }` / `{ from?; to? }` param shapes | → `contract/params.ts` | `domain/stats/contract/params.ts` | The verb arg shapes are domain-internal types; declared inline in the verb files today. | lint-time: `no-inline-types` |
| `trpc/routers/stats.ts` — comments claiming "compute now" / "stale" / "recompute" affordance | **rewrite prose** | `transport/trpc/routers/stats.ts` | Stale prose: post-Stage-3 the rollups are live, `freshness.stale` is always false, the manual recompute is gone. The router's own header still describes the pre-pivot model. | (doc-only; no enforcer — flag for the rewrite) |

---

## Cross-feature composition (the injection model)

`stats` is consumed by `chat` (the live write path), the `workloads` runner (the rebuild), the tRPC
transport layer (the reads), and — for the resolved insights gray zone — `discovery`. None reach into
stats internals; all access is the front door or composition-root injection.

**Injected into `chat.context` at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `applyStatsDelta` (typed `ApplyStatsDelta`) | stats domain | the chat engine persist arms + the canon-mutator verbs (`start-chat`, `edit-message`, `delete-messages`, `fork`) push live rollup upserts into their canon batch |

Chat builds the `StatsDelta` itself (`domain/chat/engine/stats-delta.ts`, importing
`@orb/kit/stats-tally` + `@orb/contracts/stats`); it never imports `domain/stats`. The default injection
is a **no-op** (tests/scripts that don't assert stats).

**Injected into the `reconcile-stats` workload runner (`transport/jobs`) at the composition root:**

| Op injected | Provided by | Used for |
|---|---|---|
| `reconcileStats` | stats domain | the full rebuild (backfill / post-import settle / admin drift-repair); also called by the `import-st` workload after a bulk import |

**Injected into `discovery.context` at the composition root (the resolved insights seam):**

| Op injected | Provided by | Used for |
|---|---|---|
| `stats.byModel` (or a focused economics op) | stats domain | `modelRouting` per-model tallies; `forgottenGems` `tokensOut` from `character_stats` — discovery never SUMs raw `messages` economics |

**Consumed by the tRPC transport layer:** `transport/trpc/routers/stats.ts` delegates every procedure to
`ctx.services.stats.*` with `ownerId = principal.userId` (never input) — the same owner-scoping
discipline as the rest of the read surface.

No domain reaches into `domain/stats/persistence/` or `domain/stats/write/` directly.

---

## Spine thread intersections

### §7.1 identity / auth / permission

`ownerId` is always `principal.userId`, never input — a single-owner row-scoping invariant across all 12
verbs and both write paths (`ownerStats.ownerId` references `users.id` with `onDelete: "restrict"`; the
rollup dies only on character delete, via `characterStats.characterId` CASCADE). Under the first-class
principal work (§8.6), `ownerId` remains the **owner** (the rollup is per-account economics), distinct
from the per-message `authorUserId` (which may be an agent principal). An agent's turns still credit the
**owner's** economics rollup — the cost is the owner's. Confirm this when the agent-principal credential
inheritance decision lands; do NOT split economics per-author without a deliberate decision (the
dashboard is an owner-account view).

### §7.4 types & schemas — one home, one direction

- `StatsDelta`, `ApplyStatsDelta` → `@orb/contracts/stats` (cross-boundary; chat↔stats wire).
- `wordCount` / `utcDay` / `modelKey` → `@orb/kit/stats-tally` (pure primitives; isomorphic).
- the rollup row types → `@orb/db/schema/stats.ts` (`$inferSelect`/`$inferInsert`).
- the economics `messages` projection → `@orb/contracts/stats` (the seam shape) + constructed in
  `domain/stats/persistence/messages-economics.ts`.
- `OwnerStatsView` / `CharacterStatsView` / `ModelStatRow` / `DailyPoint` / `LeaderboardRow` /
  `StatsFreshness` / `PersonaUsageRow` / `TemporalStats` / `WrappedSummary` / `ActivityHeatmap` /
  `CharacterMomentum` / `LatencyStats` / `ExtraStats` / `MomentumRow` → `domain/stats/contract/views.ts`.
- `LeaderboardSort` / `LatencyScope` → `domain/stats/contract/params.ts`.
- `StatsContext` → explicit `export interface` at `domain/stats/context.ts` top (not `ReturnType<>`).
- the `CharAccum` / `ModelAccum` / `DayAccum` / `GenRow` reconcile accumulators → file-local in
  `write/rebuild-from-canon.ts` (internal pipeline shapes; not exported, not contract types).

### §7.5 string-union dispatch discipline

- `LeaderboardSort` (`assistantTurns | totalGenTimeMs | swipes | lastActivityAt`) — ONE importable union
  in `contract/params.ts`; the `readLeaderboard` `sortCols` mapped-Record is the **gold-standard**
  pattern (a new sort member is a `tsc` error if the Record arm is missing). Keep it. The tRPC
  `z.enum([...])` must derive from the union, not re-spell it.
- `LatencyScope` (`{kind:"owner"} | {kind:"character",...} | {kind:"model",...}`) — discriminated union;
  the `readLatency` `if (scope.kind === ...)` chain should carry an `assertNever` default so a new scope
  member fails the build. The tRPC `z.discriminatedUnion("kind", [...])` mirrors it — derive, don't
  re-declare.

### knowledge-cluster.md invariant #7 (the domain's defining invariant)

> `discovery` (semantics) and `stats` (economics) share no tables; discovery computes no usage rollup.

Resolved by the three-tier seam in §"The stats↔discovery line" above. The neo-tavern state (prose +
the 2026-06-16 deletion) becomes: (a) lint forbids stats importing any vector table; (b) the economics
columns of `messages` are compile-unreachable from discovery; (c) the insights gray zone resolves by
injection/composition. **`stats` touches ZERO vector tables — verified in the steady source** (no
import of `character_embeddings` / `image_embeddings` / `chat_digests` / `chat_segments` /
`theme_clusters` / any embedding column anywhere in `domain/stats`).

---

## Esoteric / load-bearing (must survive the rewrite)

1. **The `StatsDelta` 3-slice decoupling** — the payload carries three independently-settable groups:
   the **scalar** metrics (char + owner totals), the **daily** token slice (`dailyTokensIn`/
   `dailyTokensOut`, DECOUPLED from scalar `tokensIn`/`tokensOut`), and the **model** slice
   (`modelGenerations`/`modelTokensIn`/… DECOUPLED from scalar). A write that touches two model buckets
   (a swipe whose model differs from the original) emits ONE scalar delta + ONE model-only delta per
   bucket into the same batch — without double-counting the scalar tables. *Esoteric: a variant bumps
   `day.swipes`/`day.genTimeMs` but NOT `day.tokens` (daily credits the MESSAGE stream only), so
   `variantDelta` omits `dailyTokensIn/Out` while still setting scalar `tokensIn`.* Break this and a
   re-rolled turn double-counts daily tokens.

2. **ST `\b\w+\b` word-count parity** — `wordCount` uses SillyTavern's exact `\b\w+\b` regex so the
   validation harness (`scripts/probes/stats-validate.ts` → `kit` test mirror) can match ST's
   `stats.json`. The user/non-user split is binary on `is_user` (`userWords` = user turns;
   `assistantWords` = assistant + system) — matching ST's `is_user` word split, while the 3-way turn
   COUNTS stay separate. Change the regex or the split and ST-parity breaks silently.

3. **The `(unknown)` provider bucket** — `model_stats.provider` is `NOT NULL DEFAULT '(unknown)'`. The
   `(owner, model, provider)` unique-index upsert relies on it: SQLite treats SQL NULLs as DISTINCT, so
   a true NULL provider would never conflict-match and would accumulate duplicate rows across recompute.
   `modelKey` coalesces `null → '(unknown)'` for BOTH the live delta and reconcile; the read-side
   `modelLatencyKey` / reach key must coalesce the SAME way or `charactersUsedWith` and per-model latency
   read 0 for null-provider models. This `(unknown)` sentinel parity spans `kit/stats-tally.modelKey`,
   the schema default, and the read-side keys — keep all three aligned.

4. **Percentiles computed ON READ, never stored** — a percentile isn't additively mergeable, so
   `latency` (TTFT/gen `avg·p50·p90`) is a bounded per-entity canon scan, not a rollup column. The
   avg/p50/p90 columns were DROPPED pre-squash (folded into `0000_baseline`). `readModelLatencies` is an
   O(N) one-scan optimization (vs the naive per-row `readLatency` under `Promise.all` = O(N×buckets), up
   to 200 full `messages` scans). Add a t-digest sketch only if it ever measures slow (YAGNI).

5. **Cache economics fields** — `cacheReadTokens` / `cacheWriteTokens` are OWNER + MODEL grain only
   (NOT per-character — like the percentile arrays, they're an owner dimension), live-only (0 on ST
   imports), read from `messages` only (never variants). `cacheHitRate = cacheRead / (read + write)` is
   read-derived. `maxContextTokens` is owner-only, MAX-merged, live-only (null on imports).

6. **MIN/MAX-merge for the three extrema** — `firstChatAt` (MIN), `lastActivityAt` (MAX),
   `maxContextTokens` (MAX), `computedAt` (MAX) are extrema, NOT additive — they merge by MIN/MAX in the
   upsert, unlike the monotonic `col += delta` metrics and unlike the percentiles (which couldn't merge
   at all → moved on-read). Negative increments are legal (a delete emits `(new − old)` or a `sign=-1`
   delta); the extrema do not go negative.

7. **`messageDatesApprox` migration gap** — a message > 30d (`MIGRATION_GAP_MS`) after its chat's
   creation is treated as migrated (its `createdAt` was clobbered to import time); the day is flagged
   approximate and re-bucketed onto the chat's true created-day. The flag is OR-merged in the upsert
   (once a day is flagged it stays). The UI annotates the pre-2024 approximate segment.

8. **Forks counted independently (no contentHash dedup)** — a fork is a separate playthrough; ST counts
   each `.jsonl` independently, so reconcile maximizes ST-parity by NOT deduping fork copies. Documented
   choice — do not "fix" it with content-hash collapse.

9. **Per-character grouping on `characters.id`** — `character_stats` is per-character, grouping on
   `characters.id` directly (a chat references one character — `characters.id` — so each chat credits
   exactly one character; per-character grain is the only grain). In neo-tavern this grouped on
   `character_versions.character_id` because a chat pinned one version; under **D28** there is no
   `character_versions` table and no version pin at all, so the grouping FK is just `characters.id` —
   there is nothing to collapse.

10. **`newCharacter` live-undercount caveat** — the live delta bumps `owner_stats.characters` only on the
    FIRST chat for a character; reconcile counts ALL owned characters. A character with no chats stays
    live-uncounted until a drift-repair reconcile. Documented, acceptable; the drift test tolerates it
    only because reconcile is the source of truth.

11. **Atomic per-owner REPLACE-write** — `reconcileStats` does ONE `db.batch([delete ×4, ...chunked
    inserts])` per owner so a read never sees a half-rebuilt owner (the cooccurrence pattern). Inserts
    are chunked under the libSQL bound-variable cap (char=25 cols, daily=13, model=15). `owner_stats` is
    ALWAYS written (even all-zeros) so `freshness` distinguishes computed-empty from never-run.

---

## Invariants (gate candidates)

1. **`stats` touches zero vector tables** — no `domain/stats` file imports the embeddings schema
   namespace or the `search`/`embeddings`/`discovery` front doors.
   *Enforcement: lint-time — dep-cruiser `stats-no-vector-tables`.*

2. **`discovery` computes no usage rollup** — the economics columns of `messages` are reachable only
   through the stats-owned economics projection; discovery's `messages` projection omits them.
   *Enforcement: compile-time (disjoint row projections); lint backstop `discovery-no-stats-rollups`.*

3. **Live delta ≡ reconcile rebuild** — `applyStatsDelta` over a turn's canon change equals a fresh
   `reconcileStats` rebuild over the same canon, column-for-column.
   *Enforcement: test-time — the drift test; structurally reinforced by both importing
   `@orb/kit/stats-tally`.*

4. **`wordCount` / `utcDay` / `modelKey` have one home** — `@orb/kit/stats-tally`; no re-rolled local
   copy in any write or read path. ST `\b\w+\b` parity preserved.
   *Enforcement: resolve-time (one module) + test-time (`stats-validate` parity test).*

5. **`model_stats.provider` is `NOT NULL DEFAULT '(unknown)'`** and all three key sites coalesce
   identically.
   *Enforcement: compile-time (schema) + test-time (a null-provider model upserts to one row across
   recompute and its reach/latency read non-zero).*

6. **Percentiles are computed on read, never stored** — no avg/p50/p90 column on any rollup table.
   *Enforcement: compile-time — the rollup row types carry no percentile columns; `LatencyStats` is
   produced only by `persistence/latency.ts`.*

7. **`reconcileStats` is an atomic per-owner replace** — delete ×4 + inserts in one `db.batch`.
   *Enforcement: test-time — a concurrent read during rebuild never sees a partial owner.*

8. **`StatsDelta` is the only chat↔stats wire** — chat imports `@orb/contracts/stats` +
   `@orb/kit/stats-tally`, never `domain/stats`; `applyStatsDelta` is injected, never sideways-imported.
   *Enforcement: resolve-time — `domain-no-cross-feature` fires on a chat→stats import.*

---

## Open decisions

- **Where the chat-side delta builders live** — `messageDelta` / `variantDelta` / `chatCreatedDelta`
  read chat's canon row shapes (`MessageLike` / `VariantLike`) and emit `StatsDelta`. Lean: they stay
  `domain/chat/engine/stats-delta.ts` (chat owns the row shapes; they import kit + contracts only). The
  alternative — a stats-owned builder taking a generic row — couples stats to chat's column set. Keep in
  chat; the anti-drift guard is the shared `kit/stats-tally`, not co-location with reconcile.
- **The economics `messages` projection home** — `@orb/contracts/stats` (shared shape, lets discovery's
  injected `stats` op return it) vs `domain/stats/persistence/` (domain-internal, discovery never sees
  the type at all). The latter is stricter (discovery can't even name the shape); the former is reusable.
  Lean: the *constructor* in persistence, the *result shape discovery receives* in contracts (a narrowed,
  already-aggregated economics result — not the raw row).
- **`forgottenGems` / `modelRouting` final placement** — keep as discovery verbs with injected stats
  economics (proposed), vs promote the economics-flavored halves to first-class stats verbs (e.g.
  `stats.modelUsageByGenre`). The former keeps the semantic ranking in discovery; the latter centralizes
  all economics. Decide once the discovery doc is written.
- **Per-character grouping key** — settled by **D28**: `character_stats` groups on `characters.id`
  directly (there is no `character_versions` table and no version pin to collapse). The live delta
  builders, reconcile, and the rollup FK all key on `characters.id`. The earlier open question of
  sequencing a `cv.character_id → characters.id` regroup against `character.md` is closed — there was
  never a version to de-pin.
- **Per-author economics under agent principals** — the rollup is per-owner today. When agents become
  first-class principals (§8.6), decide whether an agent's turns credit the owner's economics (current
  behavior, lean: yes) or carry a per-author breakdown. Tied to the agent credential-inheritance
  decision.
- **t-digest for latency** — percentiles are bounded scans today (YAGNI). If the owner-scope latency
  scan ever measures slow, a stored t-digest sketch on the rollup is the seam (additively mergeable,
  unlike raw percentiles) — but only then.
