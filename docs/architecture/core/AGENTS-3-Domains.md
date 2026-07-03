## 7. Domain Map (Inherited from domains.md)

# Orbweaver — domain inventory

> **Status: planning.** The feature map for `packages/server/src/domain/`. Each domain follows the
> 8-slot template in `Core-0-Architecture-and-Structure.md`. This doc records _which_ features exist, why, and how the
> knowledge/derived-data cluster (the neo-tavern tangle) is untangled.

## The map (neo-tavern's 20 → orbweaver)

| Domain            | Origin                         | Owns                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **chat**          | keep (slim)                    | the turn lifecycle, canon, assembly, arbitration. **Stateless-first** — the agent-sdk session cache is backend-internal (`infra/providers/backends/agent-sdk/session/`, D8), NOT a chat concern. `memory` is a subsystem here but _delegates_ vectors (below).                                                                 |
| **character**     | keep                           | character identity; the card is a flat `characters` row; history = a `character_snapshots` log that gates nothing (D28).                                                                                                                                                                                                       |
| **persona**       | keep                           | personas; pin = anchor (`{{user}}`), active = per-participant.                                                                                                                                                                                                                                                                 |
| **preset**        | keep                           | **generation config only** (params/customParameters/sections) — never the connection.                                                                                                                                                                                                                                          |
| **world-info**    | keep                           | one books/entries store + scope junctions (already correct).                                                                                                                                                                                                                                                                   |
| **connection**    | **NEW**                        | api/source/model/providerRouting; the ONE provider-vocab map (runner/family _derived_ from source+protocol); `resolveRole(role)` for all 7 roles (chat/embed/rerank/summarize/imageEmbed/generateImage/agent). Absorbs **models** (the catalog = "what a connection can pick").                                                |
| **credentials**   | keep (un-invert)               | ALL credential logic — resolve + CRUD + metadata. No `_shared` guts.                                                                                                                                                                                                                                                           |
| **tag**           | keep (fix)                     | one tag namespace + per-entity junctions; **proposed = a status**, not a parallel store. Labels only — NOT analytics facets (those are `discovery`).                                                                                                                                                                           |
| **embeddings**    | **NEW**                        | the vector substrate: embeds every source + owns the vector store + the event-driven indexer. The ONE write path. (Below.)                                                                                                                                                                                                     |
| **search**        | keep (narrow)                  | the ONE retrieval capability (cosine + rerank + field-search). One cosine engine.                                                                                                                                                                                                                                              |
| **discovery**     | rename of **corpus**           | library _semantic understanding_: themes, hubness/centrality, near-duplicates, distillation (genre/tone/pitch), archetypes, similarity browsing. Consumes embeddings + search; embeds nothing itself.                                                                                                                          |
| **stats**         | keep (narrow)                  | turn **economics** only — tokens/cost/cache/timing. Distinct from `discovery` (semantics).                                                                                                                                                                                                                                     |
| **buddy**         | keep                           | the companion = the `agent` role connection (no hand-rolled router).                                                                                                                                                                                                                                                           |
| **settings**      | keep                           | app + user setting tiers.                                                                                                                                                                                                                                                                                                      |
| **sessions**      | keep                           | auth/BFF sessions (distinct from SDK chat sessions).                                                                                                                                                                                                                                                                           |
| **admin**         | keep                           | admin surfaces / gating.                                                                                                                                                                                                                                                                                                       |
| **import**        | keep (rework)                  | TARGET: a canon-write that **emits ContentChanged events** so the indexer auto-runs. (Today it stops at row insert + emits nothing — verified.) Unify the two bulk loops (zip route vs `import-st` workload) into one.                                                                                                         |
| **export**        | keep (rework)                  | TARGET: import + export **share ONE serialization core**. (Today they are two independent mappers coupled only by round-trip tests — role-map triplicated, WI mapping hand-duplicated, `creator`/`regex_scripts` survive only via a `raw` blob. Verified.)                                                                     |
| **assets**        | keep                           | the CAS index/table (the blob _store_ itself is `infra/storage`).                                                                                                                                                                                                                                                              |
| **workloads**     | keep                           | the execution engine the indexer + bulk passes enqueue into.                                                                                                                                                                                                                                                                   |
| **notifications** | **NEW**                        | the per-user durable inbox + delivery stream (invite/kick/host-handoff to non-members the per-chat bus can't reach); part of the unified roster/group/multi-human system (ledger D16). Producers (chat) emit via an injected op; transport streams it on the `chat.streamMessages` resume shape. (`domains/notifications.md`.) |
| ~~models~~        | → **connection**               | merged.                                                                                                                                                                                                                                                                                                                        |
| ~~debug~~         | → **foundation/observability** | `/api/_debug` is observability, not a domain.                                                                                                                                                                                                                                                                                  |
| ~~corpus~~        | → **discovery**                | renamed (name required insider knowledge; it does library understanding).                                                                                                                                                                                                                                                      |

## Participants, agents & identity (character + persona)

> **Authoritative detail: [`participants-agents-identity.md`](./participants-agents-identity.md).**

The reframe (confirmed by recon): the foundation is a **stateless chat turn** —
`(system prompt, this-participant's-view-of-canon, connection) → reply`, a pure function of canon, run by
**pluggable backends**: stateless chat-completions (OpenRouter incl. Claude-via-OR / vLLM /
custom-openai) + `claude-agent-sdk` (the sub + the OpenRouter Anthropic skin). **No direct-Anthropic-API
backend** (no key; the `@anthropic-ai/sdk` peer stays unused). **"Agent mode" (tools + loop + session
via `claude-agent-sdk`) is opt-in, NOT the whole bet** — `claude-agent-sdk` is reserved for the Max sub
(its only legal path) + agent mode; most turns are stateless and never touch it. This dissolves neo-tavern's name-stamping merge-tax (per-participant
isolation removes the merge), the agent-sdk env-knob tax (a backend detail, not a per-turn concern), and
the seed/reseed statefulness (a backend-internal canon-derived cache). **`character` participants can opt
into agent mode; `buddy` is the first agent-mode consumer** — one chat-turn path + a `tools?`/loop flag.
**persona** is
per-participant (active, on the roster — drop `chats.personaId`) + a chat-level **anchor** (`{{user}}`
POV, the kept dual-persona rule) + per-message **attribution**; multi-human = each human carries their
own persona. **character** = live identity, the flat `characters` card row + history-as-restorable
snapshots (D28: no `character_versions`/cv-pin; history = the `character_snapshots` log; `restore`
copies a snapshot blob → the live row in-place, gating nothing). Open: per-agent connection is a new routing axis; whether `agent` is
a thin shared domain vs a pattern composed by chat+buddy.

## Memory ↔ search: two reads over ONE substrate (original intent — `memory-diagram.pdf`)

> **Authoritative detail: [`domains/memory.md`](./domains/memory.md).** That doc is the source of
> truth for the embeddings/memory/search/discovery cluster (substrate shape, tiering, group scoping, the
> egocentric-scoped-recall decision, knobs, invariants). The summary below must not contradict it; if it
> ever does, the cluster doc wins.

The downloaded purpose doc establishes memory's design, and it reframes the whole cluster: **memory and
cross-chat search were _designed_ to share one substrate — the tangle is botched execution of
intentional sharing, not an accident to be split.**

- **Memory's job:** canon is append-only forever; the model's window sees only the recent _tail_;
  memory is the **regenerable index that reaches past the window and pulls the relevant past forward**.
  Orthogonal to compaction (which compresses _inside_ the window). Pure function of canon — never a
  second source of truth.
- **One substrate, two lenses** over fixed 16-msg blocks: **segment** (verbatim) + **digest** (distilled:
  topic-anchor + significance-filtered facts + 15–30 keywords, **tiered**, fanOut 8). Both keyed
  `(chatId, blockIdx, seq-span)`; digest = sharp search key, segment = verbatim ground truth.
- **Search is the engine; memory is search scoped to one chat.** Not two parallel readers — ONE
  retrieval engine with memory as a parameterized application of it.
  - **`search` engine parameters:** **scope** (one chat · a character · all the user's chats) ×
    **lens** (raw **segments** verbatim · **semantic** digests · a specific **tier**) × rerank/top-k/
    hub-adjust → ranked hits → seq-spans back to canon.
  - **cross-chat use** → "where across _all_ my chats did X happen?" → scope=all, any lens.
  - **memory use** → `search(scope=this chat, lens=tier-0 digests | tiered bridge, window=aged-out)`
    → assembled into the single `{{memory}}` macro (dynamic/cache-safe half).

**Corrected ownership (supersedes "memory delegates everything" AND "memory owns its own read"):**

| Concern                                                                                                                                                                     | Owner                                                | Note                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| the **substrate build** (slice 16-msg blocks → segment + digest + tier/consolidate; the summarizer = the ST-summarizer replacement; self-heal; fork-lazy)                   | **memory**                                           | memory's defining job is _building_ the substrate, not retrieving over it                                              |
| the **`{{memory}}` read policy + assembly** (scope=this chat, window=aged-out, which lens/tier/mode)                                                                        | **memory**                                           | calls `search` for the actual retrieval; owns only the chat-scoped policy + assembly                                   |
| the **retrieval engine** — scope × lens × rerank over ALL vector columns (segments/digests/cards/avatars); within-chat exact cosine + cross-chat scan + CSLS + joint rerank | **search**                                           | read-only; the ONE engine both cross-chat search and memory invoke. ANN dropped — exact scan at this scale             |
| `embedAndStore(kind, key, …)` + embed dispatch + `content_hash` + the one 1024-dim space                                                                                    | **embeddings** (shared _mechanism_, not a row-owner) | producers write THROUGH it (kills 6 hand-rolled sites); rows stay FK'd to their producer                               |
| themes/hubness/duplicates/distillation + **computes `hub_score`** (a search ranking signal `dist−1+hub_score`)                                                              | **discovery**                                        | clean seam: discovery computes hub_score, embeddings owns the column, search reads it; a vector write must NOT null it |
| turn economics                                                                                                                                                              | **stats**                                            | zero vector tables                                                                                                     |

**Substrate-ready roadmap to NOT foreclose** (doc §9 — possible only because digests are pure functions
of canon): **trackers** (one entry updated in place — relationship/inventory/plot), **clips**
(user-pinned facts), **user-curated promotion**, **per-chat summarizer profiles**. Keep the
pure-function-of-canon invariant so these stay free to add.

### Validated against SillyTavern (the thing this replaces)

ST splits this across **two independent extensions** (`memory` = Summarize, `vectors` = RAG) that share
nothing and **duplicate their summarization code**. ST lacks every orbweaver differentiator: paired
two-lens store (ST embeds verbatim XOR a lossy summary, never both), tiered consolidation (ST keeps one
rolling prose blob), structured digests (freeform), a unified substrate, cross-chat search (ST is
hard-`chatId`-scoped), window-driven recall (ST uses a fixed message count `protect=5`, not tokens), and
any group scoping. So our "build once, read many" is a strict superset.

**Steal from ST:** (1) **hash-diff incremental sync** (diff content hashes → insert new / drop vanished;
idempotent, self-heals on edit/delete) — the model for "pure function of canon"; (2) the **recent-window
retrieval guard**, but make it **token-driven** not count-driven; (3) **score-threshold + top-k** as the
retrieval contract; (4) **distill-only-long-content** efficiency (short content embeds as-is).
**Improve on ST:** everything in the gap list above. ST gives **no precedent for group scoping** — that
decision is ours (see §11.5 of the group-chat plan; leans egocentric-only for `scoped`).

## The knowledge / derived-data untangle

**The neo-tavern tangle:** `corpus` embedded characters/avatars _and_ read `chat/memory`'s digests for
themes; `memory` did its own embedding _and_ its own cosine; `search` ran a _second_ cosine over the
same tables; `stats` and `corpus` were both "analytics" with no clean line. Vectors were written from
**four** places. Incestuous and confusing.

**The fix — producer → store → consumer, with embedding as a substrate nobody co-owns:**

```
                          ┌──────────────── embeddings (NEW) ───────────────┐
   canon writes ──emit──▶ │ the ONE vector substrate + event indexer         │
   (card / avatar /       │ • embeds every SOURCE (card, avatar, chat        │
    segment / digest)     │   segment, chat digest) → ONE 1024-dim space     │
                          │ • owns the vector tables + the ONE write path     │
                          │ • derive runs via the workloads engine            │
                          │ • content_hash = staleness gate                   │
                          └───────────────┬──────────────────────────────────┘
                                          │ (read)
            ┌─────────────────────────────┼─────────────────────────────┐
            ▼                             ▼                              ▼
        search                         memory                       discovery
   ONE retrieval cap             chat-scoped recall              library understanding
   (cosine + rerank +            → {{memory}} macro.             themes · hubness ·
    field-search). ONE            Owns digest GENERATION          near-duplicates ·
    cosine engine.                (summarize); DELEGATES          distillation (genre/
                                  embed→embeddings,               tone/pitch) · archetypes.
                                  retrieve→search.                Consumes embeddings +
                                                                  search; embeds NOTHING.
```

What it kills (counts verified by whole-file recon — they were worse than first assumed):

- **6 vector write sites across 5 tables → 1.** Today: corpus card upsert (×2), image upsert, theme
  centroids, memory digests, memory segments — each hand-rolls the same embed→null-filter→upsert→
  reset-hubScore dance (the reset rule is copy-pasted 3×). `embeddings` owns every embed+store;
  card/avatar/segment/digest are just _source kinds_ in its indexer registry.
- **4 ranking implementations → one `search` domain with two engines.** Today: SQL `vector_distance_cos`
  top-k scan + JS all-pairs/clustering (`vector-math.ts`) + a _third_ hand-inlined dot loop
  (`pair-cosine.ts`) + a **separate MiniSearch/BM25 lexical engine** (`field-search`). The split is by
  _access pattern_ (top-k scan vs in-RAM all-pairs), not by domain — corpus straddles both. `search`
  owns **both a vector engine and a lexical engine** (they're complementary, not dups); `memory` and
  `discovery` call them.
- **memory stops being a mini-corpus — but this is a REWRITE, not a refactor.** Today memory delegates
  _nothing_: it's a full parallel embed + JS-cosine + rerank stack with per-chat tier / mixA–C /
  §11.5 scoped-egocentric-bucket semantics that `search`'s owner-wide scan does NOT model. Target:
  memory owns digest _generation_ + the `{{memory}}` assembly + those chat-scoped query semantics, and
  delegates the raw embed→store (to `embeddings`) and the vector scan (to `search`). Stays a `chat/`
  subsystem; its embeddings/search ops are composition-root-wired into chat's `context.ts`, never
  sideways-imported. **The tier/scoped semantics must be preserved — that's the risk to manage.**
- **corpus's _mutation_ of memory tables ends.** Today `discovery`(corpus) doesn't just read
  digests/segments — it **writes `hub_score` back into them**, and `search` ranking reads that score.
  `hub_score` is a discovery-computed signal stored on embeddings rows: design the seam (embeddings
  owns the column; discovery computes it; search reads it) so a vector write doesn't have to null it in
  3 places.
- **The schema-naming lie ends.** `chat_digests`/`chat_segments` currently live in
  `db/schema/search.ts` (named for the _consumer_). In orbweaver the memory/embeddings producer owns
  its schema; `discovery` rollups own theirs.
- **`corpus` the name is gone** → `discovery`.
- **Analytics splits into two non-overlapping homes:** `stats` = **economics** (tokens/cost/cache —
  touches zero vector tables, verified); `discovery` = **semantics** (themes/hubness/facets). The line
  is real but was made clean by _deletion_ + prose comments — orbweaver should make it **type-enforced**
  (one residual gray zone: `corpus/insights.ts` still reads raw `messages`).

### Where the embedded SOURCES come from (one space, many producers)

| Source kind         | Produced by        | Embedded by `embeddings` indexer on event |
| ------------------- | ------------------ | ----------------------------------------- |
| character card text | character save     | `character.updated`                       |
| avatar image        | asset upload       | `asset.created`                           |
| chat segment        | chat turn (memory) | `digest/segment.created`                  |
| chat digest         | memory summarize   | `digest.created`                          |

All land in the **one 1024-dim space** (text↔image comparable), one table family owned by `embeddings`,
searched by the one cosine engine in `search`.

## Cross-cutting concept homes (the partitioning rule, as domains)

| Concept                             | Home                       |
| ----------------------------------- | -------------------------- |
| connection (talk)                   | `connection`               |
| generation config (generate)        | `preset`                   |
| credential (secret)                 | `credentials`              |
| descriptive labels                  | `tag` (proposed = status)  |
| semantic facets (genre/tone/themes) | `discovery`                |
| turn economics                      | `stats`                    |
| derived vectors                     | `embeddings`               |
| per-chat recall                     | `chat/memory` (delegating) |
| retrieval                           | `search`                   |

## Connection ↔ providers boundary (verified)

> **Authoritative detail: [`domains/connection.md`](./domains/connection.md)** (selection + the capability descriptor)
> and [`core/Tier-3b-Providers.md`](./core/Tier-3b-Providers.md) (execution). Headline: ONE capability
> descriptor per `(model, backend)` with **distinct reasoning/sampling/verbosity axes** drives **both**
> the per-runner translation AND the samplers panel — replacing the two-capability-system,
> reasoning-collapsed-into-one-cascade, panel-ignores-capabilities mess.

The risk: `connection` becomes a shell over `providers`, or leaks providers' internal vocab (which
neo-tavern's `routing.ts` did — it built the request keyed on `runner`, an infra-internal name). The
clean line, confirmed sound against the real code:

- **`providers` (infra) = execution + sealed internal vocab.** Owns runners, env builders, wire
  protocols, the `(api,source)→runner→family→env-builder` mapping. `runner`/`family`/`protocol` are
  _internal_ — `runner` is provably a total function of `(api, source)` (verified), so it carries no
  information the user vocab lacks. It never leaves providers.
- **`connection` (domain) = selection + policy.** Reads settings → resolves `{api, source, model,
params, providerRouting}` + the credential → builds the request → calls `providers.runChat`. Knows
  ONLY the user vocab `{api, source, model}`. Depends _down_ on providers (allowed).
- **`ChatRequest` is keyed on user vocab `{api, source, model}` + an explicit `stateful | stateless`
  payload dimension** (verified necessity): agent-sdk is _stateful_ (prompt + resume); the completion
  runners are _stateless_ (history array). The split is a real ChatRequest dimension, not a derivable
  detail — but the **session-seeding logic (DbSessionStore / buildSeedFrames / reseed) is backend-internal
  to the agent-sdk provider** (`infra/providers/backends/agent-sdk/session/`, ledger **D8**), NOT a chat
  concern. The chat domain is **stateless-first**: it builds the request from canon and never holds a
  session; the backend reseeds-from-canon when stale. providers maps `(api,source)→runner` internally and dispatches.
- **`resolveChat` is infra** (provider-quirk knowledge: effort/thinking/fastMode per model). It sits
  before `runChat`. The _profile derivation_ feeding it is scattered across 4 dispatchers today →
  unify into one `resolveModelProfile(api, source, modelId)`.
- **One `resolveRole(role)` for all 7 roles** (chat + embed/rerank/imageEmbed/summarize/
  generateImage + agent). Feasible and anticipated by the code; today chat and the 4 bound role-clients
  use _two different_ dispatch paths and 5 roles + buddy hard-pin instead of reading settings —
  unifying reconciles those.
- **Tell that it's right:** `providers` has zero imports from any domain, and `connection` has zero
  knowledge of `runner`/`family`. If either is false, the incest is back.

The same "infra is a sealed executor; the domain owns selection" rule applies to `credentials`↔crypto,
`embeddings`↔providers.embed, `search`↔providers.rerank.

## Open / judgment calls

- **memory placement** — kept as a `chat/` subsystem (per-chat, turn-coupled) that delegates the raw
  embed/scan but KEEPS its tier/mixA–C/scoped-egocentric query semantics. **Risk:** this is a rewrite,
  not a move — the chat-scoped semantics (which `search`'s owner-wide scan doesn't model) must survive.
- **`hub_score` ownership seam — RESOLVED:** column on the embeddings row; **discovery computes** (CSLS),
  **embeddings stores** (via `writeHubScores`), **search reads**, and a vector write **never nulls** it.
  (`domains/embeddings.md`, `domains/discovery.md`, `domains/memory.md §7`.)
- **serialization core — RESOLVED:** ONE serde core shared by import+export — mappers →
  `@orb/server/kit/serde`, canonical card → `@orb/contracts/character`, PNG codec →
  `@orb/kit/png-card-chunk` (string-based), ST role bimap → `@orb/kit/message-role` (D32).
  (`core/Spine-Config-and-Serialization.md`.)
- **bulk-import + proposedTags — RESOLVED:** the outer bulk-loop driver lives at
  `entry/import/run-profile-import.ts`; `proposedTags` becomes `character_tags.status` (export reads
  `status='accepted'`). (`domains/import.md`, `domains/tag.md`.)
- **stats/discovery line as a type — RESOLVED:** type-enforced via disjoint `messages` projections
  (a stats-only economics projection vs a discovery semantic projection) + a `stats-no-vector-tables`
  dep-cruiser rule; `insights.ts`'s economics bits inject a stats op. (`domains/stats.md`.)
- **assets vs infra/storage** — `assets` domain owns the CAS _index_ (table + verbs); `infra/storage`
  owns the byte I/O. Keep split.
- **discovery internal shape** — likely subsystems `themes/ duplicates/ cooccurrence/ image-analytics/` + `substrate/` (distill is a VERB, not a subsystem — see `domains/discovery.md`) (kmeans/pca/etc., the pure math), per the template.

---

## 8. Full Architecture Documentation Index

- **core/**
  - [AGENTS-1-Architecture.md](docs/architecture/core/AGENTS-1-Architecture.md)
  - [AGENTS-2-Spine.md](docs/architecture/core/AGENTS-2-Spine.md)
  - [AGENTS-3-Domains.md](docs/architecture/core/AGENTS-3-Domains.md)
  - [Core-0-Architecture-and-Structure.md](docs/architecture/core/Core-0-Architecture-and-Structure.md)
  - [Core-Audits-and-Debt.md](docs/architecture/core/Core-Audits-and-Debt.md) _(live debt registry; archeology split into the 3 below)_
  - [Core-Doc-Review-Punchlist-2026-06-28.md](docs/architecture/core/Core-Doc-Review-Punchlist-2026-06-28.md)
  - [Core-Debt-Cleared-Ledger.md](docs/architecture/core/Core-Debt-Cleared-Ledger.md)
  - [Core-Doc-Inconsistency-Audit-2026-06-26.md](docs/architecture/core/Core-Doc-Inconsistency-Audit-2026-06-26.md)
  - [Core-BUILD-PLAN.md](docs/architecture/core/Core-BUILD-PLAN.md)
  - [Core-Laws-and-Precedents.md](docs/architecture/core/Core-Laws-and-Precedents.md) _(§0–§6 + §7/enforcement redirect index → the 7 below)_
  - [Core-Path-Registry-D1-D34.md](docs/architecture/core/Core-Path-Registry-D1-D34.md)
  - [Core-Path-Registry-D35-D43.md](docs/architecture/core/Core-Path-Registry-D35-D43.md)
  - [Core-Path-Registry-D44-D52.md](docs/architecture/core/Core-Path-Registry-D44-D52.md)
  - [Core-Path-Registry-D53-D59.md](docs/architecture/core/Core-Path-Registry-D53-D59.md)
  - [Core-Path-Registry-D60-D61.md](docs/architecture/core/Core-Path-Registry-D60-D61.md)
  - [Core-Enforcement-Active-Gates.md](docs/architecture/core/Core-Enforcement-Active-Gates.md)
  - [Core-Enforcement-Deferred-Dropped.md](docs/architecture/core/Core-Enforcement-Deferred-Dropped.md)
  - [Core-Legacy-Migration-and-Gaps.md](docs/architecture/core/Core-Legacy-Migration-and-Gaps.md) _(split index → the 3 below)_
  - [Core-Shared-Dissolution.md](docs/architecture/core/Core-Shared-Dissolution.md)
  - [Core-Event-Bus-Parity-Audit.md](docs/architecture/core/Core-Event-Bus-Parity-Audit.md)
  - [Core-ST-Feature-Gap-Register.md](docs/architecture/core/Core-ST-Feature-Gap-Register.md)
  - [Core-Planning-and-Checklists.md](docs/architecture/core/Core-Planning-and-Checklists.md)
  - [Core-SillyTavern-Feature-Map.md](docs/architecture/core/Core-SillyTavern-Feature-Map.md)
  - [Core-STATUS.md](docs/architecture/core/Core-STATUS.md)
  - [Spine-Config-and-Serialization.md](docs/architecture/core/Spine-Config-and-Serialization.md)
  - [Spine-Identity-and-Auth.md](docs/architecture/core/Spine-Identity-and-Auth.md)
  - [Spine-Testing.md](docs/architecture/core/Spine-Testing.md)
  - [Spine-TypeScript-and-Patterns.md](docs/architecture/core/Spine-TypeScript-and-Patterns.md)
  - [Tier-1-DB.md](docs/architecture/core/Tier-1-DB.md)
  - [Tier-2-Foundation.md](docs/architecture/core/Tier-2-Foundation.md)
  - [Tier-3-Infra.md](docs/architecture/core/Tier-3-Infra.md)
  - [Tier-3b-Providers.md](docs/architecture/core/Tier-3b-Providers.md)
  - [Tier-4-Transport.md](docs/architecture/core/Tier-4-Transport.md)
  - [Tier-5-Entry.md](docs/architecture/core/Tier-5-Entry.md)
  - [UI-Architecture-and-Layout.md](docs/architecture/core/UI-Architecture-and-Layout.md)
  - [UI-Gates-and-Lessons.md](docs/architecture/core/UI-Gates-and-Lessons.md)
  - [UI-Lib-TanStack-Form.md](docs/architecture/core/UI-Lib-TanStack-Form.md)
  - [UI-Lib-TanStack-Query.md](docs/architecture/core/UI-Lib-TanStack-Query.md)
  - [UI-Lib-TanStack-Router.md](docs/architecture/core/UI-Lib-TanStack-Router.md)
  - [UI-Lib-TanStack-Virtual.md](docs/architecture/core/UI-Lib-TanStack-Virtual.md)
  - [UI-Lib-Zustand.md](docs/architecture/core/UI-Lib-Zustand.md)
  - [UI-Primitives-and-Reuse.md](docs/architecture/core/UI-Primitives-and-Reuse.md)
  - [UI-Theming-and-Content.md](docs/architecture/core/UI-Theming-and-Content.md)
- **domains/**
  - [admin.md](docs/architecture/domains/admin.md)
  - [assets.md](docs/architecture/domains/assets.md)
  - [buddy.md](docs/architecture/domains/buddy.md)
  - [character.md](docs/architecture/domains/character.md)
  - [chat.md](docs/architecture/domains/chat.md)
  - [connection.md](docs/architecture/domains/connection.md)
  - [credentials.md](docs/architecture/domains/credentials.md)
  - [discovery.md](docs/architecture/domains/discovery.md)
  - [domains.md](docs/architecture/domains/domains.md)
  - [embeddings.md](docs/architecture/domains/embeddings.md)
  - [export.md](docs/architecture/domains/export.md)
  - [import.md](docs/architecture/domains/import.md)
  - [memory.md](docs/architecture/domains/memory.md)
  - [notifications.md](docs/architecture/domains/notifications.md)
  - [participants-agents-identity.md](docs/architecture/domains/participants-agents-identity.md)
  - [persona.md](docs/architecture/domains/persona.md)
  - [preset.md](docs/architecture/domains/preset.md)
  - **proposed/**
    - [README.md](docs/architecture/domains/proposed/README.md)
    - **databank/**
      - [databank.md](docs/architecture/domains/proposed/databank/databank.md)
    - **expression-stage/**
      - [expression-stage.md](docs/architecture/domains/proposed/expression-stage/expression-stage.md)
    - **image-studio/**
      - [image-studio.md](docs/architecture/domains/proposed/image-studio/image-studio.md)
    - **media-surfaces/**
      - [media-surfaces.md](docs/architecture/domains/proposed/media-surfaces/media-surfaces.md)
    - **scripting-automation-extensibility/**
      - [scripting-automation-extensibility.md](docs/architecture/domains/proposed/scripting-automation-extensibility/scripting-automation-extensibility.md)
    - **tool-use/**
      - [tool-use.md](docs/architecture/domains/proposed/tool-use/tool-use.md)
  - [search.md](docs/architecture/domains/search.md)
  - [sessions.md](docs/architecture/domains/sessions.md)
  - [settings.md](docs/architecture/domains/settings.md)
  - [stats.md](docs/architecture/domains/stats.md)
  - [tag.md](docs/architecture/domains/tag.md)
  - [workloads.md](docs/architecture/domains/workloads.md)
  - [world-info.md](docs/architecture/domains/world-info.md)
