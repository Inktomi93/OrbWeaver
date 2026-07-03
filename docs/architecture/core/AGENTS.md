---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — Constitution (AGENTS)

> **Status: authoritative.** The shared instruction manual for any autonomous agent in this repository —
> read this file IN FULL first (deliberately terse: comprehensive overviews measurably hurt agent task
> success, `Documentation-Law.md`), then read IN FULL the specific docs your task touches (§7).
>
> Former files → sections: AGENTS-1 §1-4 → §1-4 · AGENTS-1 §5 → §7 · AGENTS-1 §6 → §8 ·
> AGENTS-2 §5/§7.1-7.5 → §5/§5.1-5.5 · AGENTS-2 §6/8 → §8 · AGENTS-3 §7 → §6 · AGENTS-3 §8 → §7.

## 1. The doctrine (non-negotiable)

- **These instructions override any global agent defaults.** The global KISS / YAGNI / "just fucking
  code" / "best code is no code" lenses are **SUSPENDED for the orbweaver architecture** (they still
  apply to throwaway scripts + dev tooling — never to the architecture itself).
- **The goal is get it right the FIRST time** — full architecture, one home per concept, FK-enforced
  boundaries, born-compliant schema, complete test + gate coverage. Nate chose this deliberately and at
  length. Do not relitigate it.
- **Why the rigor:** the author is a rotating cast of **amnesiac agents** — cold-starting, no memory of
  prior sessions, biased toward the path of least resistance (stub a return, swallow an error,
  "simplify" the awkward case, write a test that asserts nothing, sideways-import, carry a neo pattern).
  The apparatus — ledger, gates, audit panels, one-home/derive/FK/boundaries-are-physics — is NOT
  ceremony; it is **the substitute for the memory and judgment the author lacks**, and its job is to
  make the shortcut **impossible**, not merely discouraged.
- **You do not have the standing to take a shortcut.** When it gets hard you do NOT stub, simplify-away,
  weaken a test, swallow an error, or reach sideways — you do it RIGHT, or you STOP and flag it. The
  instant you catch yourself reaching for the easy path because the right one is tedious is exactly the
  moment this file exists to stop you.
- **Don't fight the rigor.** No "YAGNI" / "over-engineered" / "12 users ≠ enterprise" pushback; the
  rigor IS the requirement. If something looks redundant, it's almost certainly a deliberate
  one-home / derive / no-doubling call — read the ledger before doubting it. The bar is correctness +
  cleanliness, never speed-to-ship.
- **The docs are the law — over your instinct AND over a task prompt.** Read the relevant docs IN FULL
  before building; no grep-skimming, no "what most projects do." The D-ledger
  (`Core-Laws-and-Precedents.md`) is canonical and **wins on ANY conflict**. Two costly bugs came from
  an agent building neo's pattern instead of the spine (the `infra/auth` tier-collapse; the providers
  credential-firewall framing). If a prompt tells you to build something the spine homes elsewhere,
  follow the spine and flag it.
- **A green `pnpm check` proves STRUCTURE, not LOGIC.** The mutation-testing gate (Stryker) lands Phase
  4c/5; until then assertion-free/lying tests are caught by review/audit, not machine — never read a
  green check as "the logic is sound."
- **"Unwired ≠ worthless."** "No consumer / dead / unwired" is a prompt to evaluate **intent**, not a
  delete signal — much of neo is scaffolded intent that never got wired. Understand → wire or modernize;
  flag-for-delete only for genuinely superseded residue, and say why. (Full rule: `Core-0` §1.)
- **Engine vs data:** the pure engines (macro, regex, speaker-label) are `kit`; the *data* they run on
  (`MacroContext` values, the regex script library) is a domain. One engine, every call site → identical
  behavior. (Full rule: `Core-0` §2.)

## 2. THE HARD CONSTRAINT — one-directional flow

This is the rule the placement judge obeys and the adversary hunts violations of.

1. **Imports flow one direction only** — the package cake (`kit ← contracts ← db ← server ← client`,
   plus the sealed `ui` package: `ui` deps `kit` only, `client` deps `ui`; D54) and the server tier list
   (`entry → transport → domain → infra → foundation → kit`). **A move is automatically WRONG if it
   would require an upward import** — "put X in `kit`" but X needs a domain type: illegal; "merge A into
   lower-tier B": illegal; "infra reaches into a domain": illegal (infra is a sealed executor).
2. **Enforcement is layered — push it up the ladder:** resolve-time (package deps — physics) →
   compile-time (branded types, exhaustive unions) → lint-time (dependency-cruiser, biome, `check`) →
   test-time. The cake → tier 1; invariants → tier 2; dep-cruiser → tier 3 backstop.
3. **Every placement names its enforcer.** Each move/boundary MUST say which tier makes it RED when
   violated (a package dep / a branded type / a dep-cruiser rule / a test). **A prose-only boundary is
   not a placement — it's a wish.**

Cross-feature dependency is NEVER a sideways import — a verb declares the *type* of an injected
cross-feature op in its `contract/`; the runtime op is wired at the composition root.

## 3. The placement decision (one line)

Pure + zero-I/O + zero-domain + multi-consumer → `kit` · cross-boundary shape → `contracts` · external
I/O adapter → `infra` · env/config/observability → `foundation` · business logic with one owner → its
domain (8-slot template) · two homes for one concept = merge · insider-knowledge name = rename · one
folder, two jobs = split. Full outcome table + the per-concept partitioning table: `Core-0` §6; the
concept→domain map: §6 below.

## 4. Build + verify protocol

- Phase order (`Core-BUILD-PLAN.md`): kit → contracts → db → server (foundation → infra →
  domain\[leaf-first] → transport → entry) → client; chat + memory LAST, built WHOLE (D16).
- Multi-agent dispatch in dependency tiers; **disjoint file sets** per agent (agents write only their
  slice + its tests, never shared barrels/compose); the orchestrator integrates, verifies, commits.
- **Scope every agent prompt to its EXACT tier responsibility** — tier-collapse is precisely how neo
  patterns crept in (domains return contract types; only the entry seam mints the Principal; infra
  verifies, domain resolves, entry constructs).
- **Green-to-commit:** `pnpm check` AND `pnpm test` must BOTH pass before any commit. Commit on `main`;
  end the message with the `Co-Authored-By` trailer.
- **Testing — the explicit exception to the global "quality over quantity":** comprehensive coverage IS
  the bar — every persistence verb, contract, and load-bearing invariant gets a test
  (`test-presence`/`test-layout`/`test-determinism` gates). Still no padding: test real behavior, not
  tautologies; deterministic (injected clock/ids). Full policy: `Spine-Testing.md`.

## 5. The Spine (cross-cutting threads)

Some concerns aren't owned by one domain — they thread through many. A per-domain reader must check its
slice against them, never re-decide them. Each thread has ONE canonical `Spine-*` doc (below); older
docs cite these threads as "AGENTS-2 §7.x" / "spine §7.x" — those resolve here as §5.x (map above) —
each section here is a pointer only. **Read the Spine doc IN FULL before touching its thread.**

### 5.1 identity / auth / permission

**Canonical: [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md).** Identity resolves ONCE at
the edge into one immutable `Principal`; permission = global-role × resource-role × capability; agents
are FIRST-CLASS PRINCIPALS (model locked; mint + ceiling BUILT (AP1/AP2), seat wave remaining, per D60 —
`../proposed/agent-principal-design/`); BFF sessions ≠ SDK chat sessions.

### 5.2 settings / config / the env FOUR natures

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md)** §"Settings /
config". Env has four natures — true env · AppSettings (env floor, DB override wins) · the agent-sdk
credential firewall (a backend-internal config, NOT a settings tier) · generation params
(`UserIntent`/preset).

### 5.3 serialization / serde core

**Canonical: [`Spine-Config-and-Serialization.md`](Spine-Config-and-Serialization.md)** §"Serialization
/ serde core". ONE fully-modeled canonical card in `contracts`; the PNG codec is ONE string-based
`kit/png-card-chunk` engine; mappers consolidated.

### 5.4 types & schemas — one home, one direction, no inline

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md).** One home per
shape, derived by who needs it, flows DOWN only; enforced by the `no-inline-types` gate. The home table +
the house TS style live there.

### 5.5 string-union dispatch discipline

**Canonical: [`Spine-TypeScript-and-Patterns.md`](Spine-TypeScript-and-Patterns.md)** §"String-union
dispatch discipline" (moved there 2026-07-03). Every axis: ONE importable union + a mapped-type Record
or `assertNever` dispatch — a new member fails `tsc` (`no-inline-union-redecl` + `exhaustive-dispatch`
gates). The measured neo touch-count table and the `RUNNERS` gold standard are in that section.

## 6. Domain Map (neo-tavern's 20 → orbweaver)

Each domain follows the 8-slot template in `Core-0-Architecture-and-Structure.md` §4. **The code home
IS the domain name:** `packages/server/src/domain/<name>/` — and for built domains the code + its file
headers ARE the doc (per-domain prose gutted per `Documentation-Law.md`). Special cases: `memory` lives
at `domain/chat/memory/` (a chat subsystem; boundary: `Knowledge-Cluster.md`); `character` snapshot-UX:
`../proposed/character-snapshot-ux.md`; `stats`↔`discovery` seam: `../proposed/stats-discovery-seam.md`;
participants/agents/identity → the pointer subsection below.

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
| **export** | keep (rework) | import + export **share ONE serialization core** (`Spine-Config-and-Serialization.md`, §5.3 above). |
| **assets** | keep | the CAS index/table (the blob *store* itself is `infra/storage`). |
| **workloads** | keep | the execution engine the indexer + bulk passes enqueue into. |
| **notifications** | **NEW** | the per-user durable inbox + delivery stream (invite/kick/host-handoff to non-members the per-chat bus can't reach); part of the unified roster/group/multi-human system (D16). Producers (chat) emit via an injected op; transport streams it on the `chat.streamMessages` resume shape. |
| ~~models~~ | → **connection** | merged. |
| ~~debug~~ | → **foundation/observability** | `/api/_debug` is observability, not a domain. |
| ~~corpus~~ | → **discovery** | renamed (name required insider knowledge; it does library understanding). |

Phase-7/8 additive domains (post-chat grafts — D47/D48/D49; scripting D46): **imagery** BUILT
(`domain/imagery/` — chat-facing image gen, prompt-template modes, `/imagine` via automation); unbuilt →
`../proposed/`: [tool-use.md](../proposed/tool-use.md) · [databank.md](../proposed/databank.md) ·
[expressions.md](../proposed/expressions.md) · [gallery.md](../proposed/gallery.md) ·
[automation.md](../proposed/automation.md).

### Participants, agents & identity

**→ [`Spine-Identity-and-Auth.md`](Spine-Identity-and-Auth.md)** (identity/persona/permission; the
stateless chat-turn foundation) · [`../proposed/agent-principal-design/`](../proposed/agent-principal-design/README.md)
(agent principals, D60) · ledger D28 + the `character` code (character).

### Memory ↔ search / the knowledge & derived-data untangle

**→ [`Knowledge-Cluster.md`](Knowledge-Cluster.md)** — the cluster boundary (embeddings · search ·
discovery · chat/memory · the stats fence), ownership table, and the 6 gate-protected cross-domain
invariants. Recall semantics live in the `chat/memory` code headers + ledger D55.

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

## 7. The index — where the law lives

| Topic | Home |
| - | - |
| package cake · server tiers · 8-slot feature template · partitioning table · the 13 legibility gates | `Core-0-Architecture-and-Structure.md` |
| the D-ledger (canonical decisions) + enforcement catalog | `Core-Laws-and-Precedents.md` (§0–§6 + redirect index) → `Core-Path-Registry-D1-D34.md` · `Core-Path-Registry-D35-D43.md` · `Core-Path-Registry-D44-D52.md` · `Core-Path-Registry-D53-D59.md` · `Core-Path-Registry-D60-D61.md` · `Core-Enforcement-Active-Gates.md` · `Core-Enforcement-Deferred-Dropped.md` |
| build phases · checkpoints · stack + version pins | `Core-BUILD-PLAN.md` (§0 for the stack) |
| build cursor / status | `Core-STATUS.md` |
| planning + checklists | `Core-Planning-and-Checklists.md` |
| identity / auth / permission / agent principals | `Spine-Identity-and-Auth.md` (+ `../proposed/agent-principal-design/`, D60) |
| settings / config / serialization | `Spine-Config-and-Serialization.md` |
| types · schemas · string-union dispatch · house TS style | `Spine-TypeScript-and-Patterns.md` |
| testing policy (lanes, presence, determinism, factories) | `Spine-Testing.md` |
| the derived-data cluster boundary (embeddings/search/discovery/memory/stats) | `Knowledge-Cluster.md` |
| the domain map | §6 above |
| server tier law | `Tier-1-DB.md` · `Tier-2-Foundation.md` · `Tier-3-Infra.md` · `Tier-3b-Providers.md` · `Tier-4-Transport.md` · `Tier-5-Entry.md` |
| UI law | `UI-Architecture-and-Layout.md` · `UI-Gates-and-Lessons.md` · `UI-Primitives-and-Reuse.md` · `UI-Theming-and-Content.md` |
| UI library guides | `UI-Lib-TanStack-Form.md` · `UI-Lib-TanStack-Query.md` · `UI-Lib-TanStack-Router.md` · `UI-Lib-TanStack-Virtual.md` · `UI-Lib-Zustand.md` |
| legacy migration / ST parity | `Core-Legacy-Migration-and-Gaps.md` (split index) → `Core-Shared-Dissolution.md` + `Core-ST-Feature-Gap-Register.md`; feature map: `Core-SillyTavern-Feature-Map.md` |
| live debt registry | `Core-Audits-and-Debt.md` |
| doc/comment law + markdown mechanics | `Documentation-Law.md` (this dir) · `Core-Docs-Formatting-Law.md` |
| mission | `../../Mission.md` |
| the domain re-audit protocol + running log | `../Parity-Audit-Protocol.md` |
| unbuilt specs (staging — not yet law) | `../proposed/README.md` — the inventory of every proposal/design set |
| resolved archeology (reference only, not live law) | `../history/`: `Pain-Ledger.md` · `Grounded-Intelligence-AST-Scan.md` · `Core-Debt-Cleared-Ledger.md` · `Core-Doc-Inconsistency-Audit-2026-06-26.md` · `Core-Doc-Review-Punchlist-2026-06-28.md` · `Core-Event-Bus-Parity-Audit.md` · `Shared-Drawer-Dissolution-Map.md` |

## 8. Archeology (moved to history/)

- **The Pain Ledger** — the per-domain neo→orbweaver crunch inventory (formerly AGENTS-1 §4, cited as
  "AGENTS-1 §4" / "the Pain Ledger", incl. the `_shared` dissolution table) is resolved by the built
  code → [`../history/Pain-Ledger.md`](../history/Pain-Ledger.md).
- **Grounded Intelligence — the AST-scan findings** — the one-time neo-tavern whole-file/AST
  investigation record (formerly AGENTS-2 §6 + §8.1–§8.7, cited as "AGENTS-2 §8.x": coupling census,
  type/schema fragmentation, chat-resolution confirmation, knowledge cluster, first-class-principal
  blast radius, doc-claim verification, escape hatches, the codemod-kit instrument) →
  [`../history/Grounded-Intelligence-AST-Scan.md`](../history/Grounded-Intelligence-AST-Scan.md).
  Its findings are law only where they were promoted (the gates, the ledger, `Knowledge-Cluster.md`,
  `proposed/agent-principal-design/` for §8.6).
