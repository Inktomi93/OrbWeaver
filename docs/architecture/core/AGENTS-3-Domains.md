---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — domain map & documentation index (AGENTS-3)

> **Status: authoritative index.** Read after `AGENTS-1` + `AGENTS-2`. §7 is the neo→orbweaver domain
> map (what exists and why); §8 is the full doc index. Per-domain law is the CODE + its file headers
> (docs gutted per `Documentation-Law.md`); the per-domain file index is
> [`../domains/domains.md`](../domains/domains.md).

## 7. Domain Map (neo-tavern's 20 → orbweaver)

Each domain follows the 8-slot template in `Core-0-Architecture-and-Structure.md` §4.

| Domain | Origin | Owns |
| - | - | - |
| **chat** | keep (slim) | the turn lifecycle, canon, assembly, arbitration. **Stateless-first** — the agent-sdk session cache is backend-internal (`infra/providers/backends/agent-sdk/session/`, D8), NOT a chat concern. `memory` is a subsystem here but *delegates* vectors. |
| **character** | keep | character identity; the card is a flat `characters` row; history = a `character_snapshots` log that gates nothing (D28). |
| **persona** | keep | personas; pin = anchor (`{{user}}`), active = per-participant. |
| **preset** | keep | **generation config only** (params/customParameters/sections) — never the connection. |
| **world-info** | keep | one books/entries store + scope junctions (already correct). |
| **connection** | **NEW** | api/source/model/providerRouting; the ONE provider-vocab map (runner/family *derived* from source+protocol); `resolveRole(role)` for all 7 roles (chat/embed/rerank/summarize/imageEmbed/generateImage/agent). Absorbs **models** (the catalog = "what a connection can pick"). |
| **credentials** | keep (un-invert) | ALL credential logic — resolve + CRUD + metadata. No `_shared` guts. |
| **tag** | keep (fix) | one tag namespace + per-entity junctions; **proposed = a status**, not a parallel store. Labels only — NOT analytics facets (those are `discovery`). |
| **embeddings** | **NEW** | the vector substrate: embeds every source + owns the vector store + the event-driven indexer. The ONE write path. |
| **search** | keep (narrow) | the ONE retrieval capability (cosine + rerank + field-search). One cosine engine. |
| **discovery** | rename of **corpus** | library *semantic understanding*: themes, hubness/centrality, near-duplicates, distillation (genre/tone/pitch), archetypes, similarity browsing. Consumes embeddings; embeds nothing; holds its OWN in-RAM cosine — does NOT call `search` (analytics ≠ retrieval). |
| **stats** | keep (narrow) | turn **economics** only — tokens/cost/cache/timing. Distinct from `discovery` (semantics). |
| **buddy** | keep | the companion = the `agent` role connection (no hand-rolled router). |
| **settings** | keep | app + user setting tiers. |
| **sessions** | keep | auth/BFF sessions (distinct from SDK chat sessions). |
| **admin** | keep | admin surfaces / gating. |
| **import** | keep (rework) | a canon-write that **emits ContentChanged events** so the indexer auto-runs; the two neo bulk loops unified. |
| **export** | keep (rework) | import + export **share ONE serialization core** (`Spine-Config-and-Serialization.md` §7.3). |
| **assets** | keep | the CAS index/table (the blob *store* itself is `infra/storage`). |
| **workloads** | keep | the execution engine the indexer + bulk passes enqueue into. |
| **notifications** | **NEW** | the per-user durable inbox + delivery stream (invite/kick/host-handoff to non-members the per-chat bus can't reach); part of the unified roster/group/multi-human system (D16). Producers (chat) emit via an injected op; transport streams it on the `chat.streamMessages` resume shape. |
| ~~models~~ | → **connection** | merged. |
| ~~debug~~ | → **foundation/observability** | `/api/_debug` is observability, not a domain. |
| ~~corpus~~ | → **discovery** | renamed (name required insider knowledge; it does library understanding). |

Phase-7/8 additive domains (imagery · tool-use · databank · expressions · gallery · automation):
[`../domains/domains.md`](../domains/domains.md) + `../proposed/`.

### Participants, agents & identity

**→ [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md)** (identity/persona/permission; the
stateless chat-turn foundation) · [`../proposed/agent-principal-design/`](../proposed/agent-principal-design/README.md)
(agent principals, D60) · ledger D28 + the `character` code (character).

### Memory ↔ search / the knowledge & derived-data untangle

**→ [`Knowledge-Cluster.md`](Knowledge-Cluster.md)** — the cluster boundary (embeddings · search ·
discovery · chat/memory · the stats fence), ownership table, and the 6 gate-protected cross-domain
invariants. Recall semantics live in the `chat/memory` code headers + ledger D55. (The detailed prose
formerly here duplicated that doc and carried stale claims — deleted 2026-07-03.)

### Cross-cutting concept homes

**→ `Core-0-Architecture-and-Structure.md` §6** (the partitioning table: connection/preset/credentials/
roles/regex/world-info/labels/derived-data/economics/cards) + the domain map above.

### Connection ↔ providers boundary

**→ [`Tier-3b-Providers.md`](Tier-3b-Providers.md)** (execution; `runner`/`family`/`protocol` sealed
inside infra; `resolveChat`; stateful-vs-stateless backends) + the `domain/connection` code (selection +
the capability descriptor). The tell that it's right: `providers` imports zero domains, and
`runner`/`family` never appear in `domain/**`.

### Open / judgment calls

None remain open here — every call formerly listed (memory placement, `hub_score` seam, serde core,
bulk-import/proposedTags, the stats/discovery line, assets vs `infra/storage`, discovery shape,
per-agent connection) is RESOLVED in the ledger, `Knowledge-Cluster.md`, `Tier-3b-Providers.md`,
`proposed/agent-principal-design/`, or the built code. Live open work is tracked in
`Core-Audits-and-Debt.md` (the PD registry) + `../proposed/`.

## 8. Full Architecture Documentation Index

- **`docs/`** (root law)
  - [Documentation-Law.md](../../Documentation-Law.md) — doc/comment content law
  - [Mission.md](../../Mission.md)
  - [Parity-Audit-Protocol.md](../Parity-Audit-Protocol.md) — the domain re-audit protocol + running log
- **core/** (current law)
  - [AGENTS-1-Architecture.md](AGENTS-1-Architecture.md) · [AGENTS-2-Spine.md](AGENTS-2-Spine.md) · [AGENTS-3-Domains.md](AGENTS-3-Domains.md)
  - [Core-0-Architecture-and-Structure.md](Core-0-Architecture-and-Structure.md)
  - [Core-Audits-and-Debt.md](Core-Audits-and-Debt.md) *(live debt registry; resolved archeology → history/)*
  - [Core-BUILD-PLAN.md](Core-BUILD-PLAN.md)
  - [Core-Docs-Formatting-Law.md](Core-Docs-Formatting-Law.md)
  - [Core-Laws-and-Precedents.md](Core-Laws-and-Precedents.md) *(§0–§6 + §7/enforcement redirect index → the registries below)*
  - [Core-Path-Registry-D1-D34.md](Core-Path-Registry-D1-D34.md) · [Core-Path-Registry-D35-D43.md](Core-Path-Registry-D35-D43.md) · [Core-Path-Registry-D44-D52.md](Core-Path-Registry-D44-D52.md) · [Core-Path-Registry-D53-D59.md](Core-Path-Registry-D53-D59.md) · [Core-Path-Registry-D60-D61.md](Core-Path-Registry-D60-D61.md)
  - [Core-Enforcement-Active-Gates.md](Core-Enforcement-Active-Gates.md) · [Core-Enforcement-Deferred-Dropped.md](Core-Enforcement-Deferred-Dropped.md)
  - [Core-Legacy-Migration-and-Gaps.md](Core-Legacy-Migration-and-Gaps.md) *(split index → Shared-Dissolution + ST-Feature-Gap; Event-Bus-Parity-Audit → history/)*
  - [Core-Shared-Dissolution.md](Core-Shared-Dissolution.md)
  - [Core-ST-Feature-Gap-Register.md](Core-ST-Feature-Gap-Register.md)
  - [Core-Planning-and-Checklists.md](Core-Planning-and-Checklists.md)
  - [Core-SillyTavern-Feature-Map.md](Core-SillyTavern-Feature-Map.md)
  - [Core-STATUS.md](Core-STATUS.md)
  - [Knowledge-Cluster.md](Knowledge-Cluster.md)
  - [Spine-Config-and-Serialization.md](Spine-Config-and-Serialization.md) · [Spine-Identity-and-Auth.md](Spine-Identity-and-Auth.md) · [Spine-Testing.md](Spine-Testing.md) · [Spine-TypeScript-and-Patterns.md](Spine-TypeScript-and-Patterns.md)
  - [Tier-1-DB.md](Tier-1-DB.md) · [Tier-2-Foundation.md](Tier-2-Foundation.md) · [Tier-3-Infra.md](Tier-3-Infra.md) · [Tier-3b-Providers.md](Tier-3b-Providers.md) · [Tier-4-Transport.md](Tier-4-Transport.md) · [Tier-5-Entry.md](Tier-5-Entry.md)
  - [UI-Architecture-and-Layout.md](UI-Architecture-and-Layout.md) · [UI-Gates-and-Lessons.md](UI-Gates-and-Lessons.md) · [UI-Primitives-and-Reuse.md](UI-Primitives-and-Reuse.md) · [UI-Theming-and-Content.md](UI-Theming-and-Content.md)
  - [UI-Lib-TanStack-Form.md](UI-Lib-TanStack-Form.md) · [UI-Lib-TanStack-Query.md](UI-Lib-TanStack-Query.md) · [UI-Lib-TanStack-Router.md](UI-Lib-TanStack-Router.md) · [UI-Lib-TanStack-Virtual.md](UI-Lib-TanStack-Virtual.md) · [UI-Lib-Zustand.md](UI-Lib-Zustand.md)
- **history/** *(resolved audits + cleared ledgers — reference only, not live law)*
  - [Pain-Ledger.md](../history/Pain-Ledger.md) *(the neo→orb per-domain crunches — ex AGENTS-1 §4)*
  - [Grounded-Intelligence-AST-Scan.md](../history/Grounded-Intelligence-AST-Scan.md) *(the AST-scout findings — ex AGENTS-2 §6/§8)*
  - [Core-Debt-Cleared-Ledger.md](../history/Core-Debt-Cleared-Ledger.md)
  - [Core-Doc-Inconsistency-Audit-2026-06-26.md](../history/Core-Doc-Inconsistency-Audit-2026-06-26.md)
  - [Core-Doc-Review-Punchlist-2026-06-28.md](../history/Core-Doc-Review-Punchlist-2026-06-28.md)
  - [Core-Event-Bus-Parity-Audit.md](../history/Core-Event-Bus-Parity-Audit.md)
- **domains/**
  - [domains.md](../domains/domains.md) — the per-domain file index (built domains: code is the doc)
- **proposed/** *(unbuilt specs, staging — not yet law)*
  - [README.md](../proposed/README.md) — the inventory of every proposal/design set (agent-principal-design, tool-use-design, databank-design, automation-design, imagery-design, chat-crew-design, rpg-design, hub-browse-design, plugin-design, expressions-design, and the single-file proposals)
