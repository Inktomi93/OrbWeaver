# Orbweaver — Agent Instructions & Constitution

> **Status: authoritative.** This is the shared instruction manual for any autonomous agent operating in the Orbweaver repository.

**These instructions override any global agent defaults.** Orbweaver is the deliberate exception to my global
KISS / YAGNI / "just fucking code" / "the best code is the code you don't write" defaults. **Those are
SUSPENDED for the orbweaver architecture.**

Orbweaver is a ground-up, maximal-rigor remake of neo-tavern. The explicit, decided goal is **get it right
the FIRST time**: full architecture, one home per concept, FK-enforced boundaries, born-compliant schema,
complete test + gate coverage. Nate chose this deliberately and at length. Do not relitigate it.

## Why this much rigor (read before you judge the apparatus "overkill")

The author of this codebase is not a human team that builds rapport, remembers last week's decisions, and
applies senior judgment reflexively for free. It is a rotating cast of **amnesiac agents** — each starts
cold, with no memory of prior sessions, no relationship to the code, and a strong bias toward the **path of
least resistance**. When a task gets hard, the default move is to cut the corner: stub a return that
compiles, swallow the error, "simplify" the awkward case away, write a test that asserts nothing,
sideways-import instead of wiring the injection, carry a neo pattern because it's familiar. None of those
announce themselves — over a multi-week build they quietly erode the structure until it's load-bearing and
the damage is found too late.

So the apparatus is NOT ceremony. It is the **substitute for the memory and judgment the author lacks**, and
its entire job is to make the shortcut **impossible**, not merely discouraged:

- The **ledger** (`Core-Laws-and-Precedents.md`) kills Groundhog Day: DECIDED / DEFERRED-with-a-committed-default
  stops a cold agent from re-litigating a settled call or drifting into "well, most projects do X."
- The **gates** are guardrails for an author that can't be trusted to remember the rules — "born compliant"
  means the wrong thing won't compile / won't pass `check` / won't commit, instead of hoping it's recalled.
- The **adversarial audit panels** are blind-spot coverage no single amnesiac has.
- "One home / derive / FK-enforced / boundaries-are-physics" exist so the corner literally cannot be cut.
- Note the limit: a green `pnpm check` proves STRUCTURE is sound, not that the LOGIC is asserted. The gate
  for assertion-free/lying tests (Stryker, mutation testing) lands in Phase 4c/5; until then, behavioral
  test quality is caught by **review/audit, not machine** — never read a green check as "the logic is sound."

**The standing rule for every agent here: you do not have the standing to take a shortcut.** When it gets
hard, you do NOT stub, simplify-away, weaken a test, swallow an error, or reach sideways — you do it RIGHT,
or you STOP and flag it. The instant you catch yourself reaching for the easy path because the right one is
tedious is exactly the moment this file exists to stop you.

## Don't fight the rigor (the reason this file exists)

- Do NOT push back on architecture / abstraction / contracts / test coverage as "YAGNI", "over-engineered",
  or "12 users ≠ enterprise". The rigor IS the requirement here. Skip the simplification sermon.
- Do NOT "simplify" away a decision, a contract, a gate, or a tier split. If something looks redundant,
  it's almost certainly a deliberate one-home / derive / no-doubling call — read the ledger before doubting it.
- The bar is correctness + cleanliness, not speed-to-ship.
- The global YAGNI/KISS lens STILL applies to throwaway scripts + dev tooling — just never to the
  orbweaver architecture itself.

## The docs are the law — over your own assumptions

Read the relevant ones IN FULL before building. No grep-skimming, no guessing from "what most projects do."

- `docs/architecture/core/Core-Laws-and-Precedents.md` §7 (the D-ledger — D1 onward; the count grows) — **canonical; wins on ANY conflict.**
- `docs/architecture/core/Core-BUILD-PLAN.md` — the phase/wave order + per-phase checkpoints.
- `docs/architecture/core/Core-0-Architecture-and-Structure.md` — the package cake, the directory-module rule, the enforcement gates.
- `docs/architecture/core/*` — the cross-cutting law (identity-auth-permission, types-and-schemas,
  string-union-dispatch, settings-and-config, serialization-core, participants-agents-identity, testing).
- `docs/architecture/core/*` + `docs/architecture/domains/*` — per-tier / per-domain specs.
- `docs/architecture/core/Core-Laws-and-Precedents.md` — the gate catalog.

**When a doc and your instinct — or even a task prompt — conflict, the DOC wins.** Two costly bugs came
from an agent building neo's pattern instead of the spine (the `infra/auth` tier-collapse; the providers
credential-firewall framing). The spine is the source of truth — not neo, not your priors, not a
hastily-worded prompt. If a prompt tells you to build something the spine homes elsewhere, follow the spine
and flag it.

## 1. The Target & Structure

**The package cake (tier-1, resolver-enforced):**

```
kit        @orb/kit        pure primitives + pure ENGINES; isomorphic (browser-safe); no node:*/domain/I/O — isomorphic npm deps OK
contracts  @orb/contracts  cross-boundary types + zod (the wire)            → deps: kit
db         @orb/db         drizzle schema + libsql + migrations             → deps: kit, contracts
server     @orb/server     business logic                                   → deps: kit, contracts, db
ui         @orb/ui         sealed browser primitives (D54)                  → deps: kit (react/react-dom are peers)
client     @orb/client     UI                                               → deps: kit, contracts, ui, server(type-only)
```

**`kit` holds the pure ENGINES, not just utils:** the **macro engine** (`kit/macro` — parse + resolve a
template against a `MacroContext`), the **regex engine** (`kit/regex` — compile + apply + ReDoS guard +
macro-substitute hook; deps `kit/macro`), and the **speaker-label** helpers (`stripSelfSpeakerLabel`,
`parseSpeakerSpans`). **Engine vs data:** the engine is `kit`; the _data_ it runs on
(`MacroContext` values, the regex _script library_) is a domain. One engine, two call sites (server
assemble + client render) → identical behavior.

**Server tiers ARE directories; imports flow DOWN this list only:**

```
entry/        composition root — wires everything, owns no logic
transport/    drivers (tRPC routers, job workers) — thin; call DOWN into domain front doors only
domain/       business logic — one folder per feature, identical 8-slot template
infra/        external adapters (I/O) — providers / auth / storage / crypto / network
foundation/   read DOWN into by all; never reaches up — env · config · observability
kit/          server-only PURE primitives (zero I/O, zero domain)
```

**The 8-slot feature template (every domain identical):**
`index.ts` (front door — only legal external import) · `service.ts` (composition root, zero logic) ·
`context.ts` (DI bundle) · `contract/` (the typed surface: `service.ts` interface + params/results/
views/errors) · `verbs/` (one verb per file, `createX(ctx, deps?)`) · `persistence/` (all db, queries
only) · `substrate/` (pure helpers) · `<subsystem>/` (named internal subsystems).

**Cross-feature dependency is NEVER a sideways import** — a verb declares the _type_ of an injected
cross-feature op in its `contract`; the runtime op is wired at the composition root.

---

## 2. THE HARD CONSTRAINT — one-directional flow

This is the rule the placement judge obeys and the adversary hunts violations of.

1. **Imports flow one direction only** — the package cake (kit←contracts←db←server←client) and the
   server tier list (entry→transport→domain→infra→foundation→kit). **A move is automatically WRONG if it
   would require an upward import.** Examples of illegal proposals:
   - "Put X in `kit`" but X needs a domain/contracts type → kit has zero domain deps. Illegal.
   - "Merge A into B" but B sits at a lower tier and would have to reach up into A's tier. Illegal.
   - "infra reaches into a domain" → infra is below domain. Illegal (infra is a sealed executor).
2. **Enforcement is layered (push it up the ladder):** resolve-time (package deps — physics) →
   compile-time (branded types, exhaustive unions) → lint-time (dependency-cruiser, biome, `check`) →
   test-time. The cake → tier 1; invariants → tier 2; dep-cruiser → tier 3 backstop.
3. **Every placement names its enforcer.** Per the codebase law "every new invariant lands with its
   enforcer," each move/boundary a writer proposes MUST say which tier makes it RED when violated
   (a package dep / a branded type / a dep-cruiser rule / a test). **A prose-only boundary is not a
   placement — it's a wish.**

---

## 3. The placement decision rule

For every meaningful unit (a file, a function cluster, a table, a subsystem), classify the destination:

| Outcome                    | When                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **stays a domain feature** | it's business logic with one owner; fits the 8-slot template                                                    |
| **→ `kit`**                | pure, zero-I/O, zero-domain, multiple consumers (an engine or a primitive)                                      |
| **→ `contracts`**          | a cross-boundary _type/shape_ both server and client (or two domains) need                                      |
| **→ `infra`**              | external I/O adapter (a provider, crypto, storage, network, auth verification)                                  |
| **→ `foundation`**         | env / config / observability — read down-into by all, reaches up to none                                        |
| **→ another feature**      | it's a misfiled internal of a different domain                                                                  |
| **merge / rename / split** | two homes for one concept (merge); a name needing insider knowledge (rename); one folder doing two jobs (split) |

**"Unwired ≠ worthless" (load-bearing):** "no consumer / dead / unwired" is a prompt to evaluate
**intent**, not a delete signal. Much of it is SillyTavern-inherited or scaffolded intent that never got
wired (`runOnEdit`, the non-chat `roleDefaults`, `chat_participants.activePersonaId`, the
declared-but-never-emitted `WiBusEvent` entry variants).
Default to **understand the intent → wire or modernize**; flag-for-delete only when genuinely superseded
residue, and say why.

**The partitioning rule (the worst neo-tavern crunches, pre-decided — confirm or challenge against the
real code):**

| Concept                                                            | Orbweaver home                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| connection (api/source/model/providerRouting)                      | `connection` domain (NEW; absorbs `models`)                                                                          |
| generation config (params/sections)                                | `preset` (never the connection)                                                                                      |
| credential                                                         | `credentials` (un-inverted — owns resolve+CRUD+metadata)                                                             |
| roles (chat/embed/rerank/summarize/imageEmbed/generateImage/agent) | one `resolveRole(role)`                                                                                              |
| regex                                                              | a regex _library_ + scope junctions; engine is `kit/regex`                                                           |
| world info                                                         | one books/entries store + scope junctions (already right)                                                            |
| descriptive labels                                                 | `tag` (proposed = a _status_, not a parallel store)                                                                  |
| semantic facets (genre/tone/themes)                                | `discovery` (rename of `corpus`)                                                                                     |
| derived vectors                                                    | `embeddings` (NEW — the one write path + one 1024-dim space)                                                         |
| per-chat recall                                                    | `chat/memory` (delegates embed→embeddings, retrieve→search)                                                          |
| retrieval                                                          | `search` (the one engine: vector + lexical)                                                                          |
| turn economics                                                     | `stats` (zero vector tables)                                                                                         |
| character versions                                                 | NO version table (D28) — flat `characters` card row; history = `character_snapshots` (browse/restore, gates nothing) |

---

## Build + verify protocol

- Phases (BUILD-PLAN): kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport →
  entry) → client. chat + memory are LAST, built WHOLE (no feature-phasing, D16).
- Multi-agent dispatch in dependency tiers; **disjoint file sets** per agent (agents write only their slice +
  its tests, never the shared barrels/compose); the orchestrator integrates, verifies, and commits per slice.
- **Scope every agent prompt to its EXACT tier responsibility.** Don't let an agent collapse tiers — that is
  precisely how neo patterns crept in. (Domains return their contract types; only the entry seam mints the
  Principal; infra verifies, domain resolves, entry constructs; etc.)
- **Green-to-commit:** `pnpm check` (biome incl. `noConsole` + `tsc` + `test:types` + `check:structure`
  gates + depcruise) AND `pnpm test` must BOTH pass before any commit. Commit on `main`; end the message with
  the `Co-Authored-By` trailer.

## Testing (the explicit exception to the global "quality over quantity")

Comprehensive coverage IS the bar — every persistence verb, contract, and load-bearing invariant gets a
test; the `test-presence` / `test-layout` / `test-determinism` gates enforce it. Still no pure-padding:
test real behavior (FK cascades, enum↔tuple mirrors, the security belts, round-trips that exercise the parse
seam), not tautologies. Tests are deterministic — injected clock/ids, no `Date.now()`/`new Date()`/`Math.random`.

## Stack

6-package pnpm workspace under `packages/{kit,contracts,db,server,ui,client}`; tests mirror under `tests/`.
Node 24 · pnpm 11 · TypeScript strict · Biome (ratcheted to MAX) · dependency-cruiser · vitest · lefthook.
Backend: Drizzle + libSQL · Zod · tRPC · `@anthropic-ai/claude-agent-sdk` · OpenRouter. Pinned versions +
the rationale live in `Core-BUILD-PLAN.md` §0 and the ledger — check there, don't assume.

## 4. The Pain Ledger (Historical Context)

Each entry: the **crunch** the remake must resolve. An agent reading that slice should confirm each pain
exists at file:line, note any that are stale, and surface esoteric/load-bearing details the ledger
misses (those feed the adversary).

- **chat** (16k lines — the integration point): the resolution **order is invisible** (split across
  `context.ts`/`assembly`/`engine/pipeline.ts`, no function says "this is the order"); WI **double-render**
  (`macro→regex→wrap→macro`) is a correctness trap; `assembleCtx` **mutated in place** (fragile per-speaker
  loop); budget split across tallies + **unbudgeted** `chat_injections`; the guided-steering and
  name-stamp sprawl; `runOnEdit` **unwired** (intent, not dead); render-context-null **silent raw
  fallback**. Target: order is ONE explicit stage list; ONE injection list + ONE budget; two-phase
  immutable assemble; engines → `kit`; the LIVE 2B rolling-tail cache breakpoint is **PRESERVED** (only
  the dead boundary-gate drops — the early "drop the breakpoint minefield" framing was wrong).
  (Authoritative for the exact counts + mechanics: `domains/chat.md` — this bullet orients; it does not
  carry the numbers.)
- **connection / models** (`models` is 242 lines, folds in): connection **fragmented** across
  user-settings / chat-row / preset; **two capability systems** (`ChatModel` + `FAMILY_CAPS`,
  incompatible shapes, cross-merged); **reasoning collapsed into one cascade** (`effort:"none"` doubles
  as the off-switch; translated twice); `routing.ts` keyed on **`runner`** (infra-internal vocab leak);
  scattered `derive*Profile` dispatchers (three, not four); the params panel has only **coarse
  source-level knob gating** (a build-on point, not capability-driven); roles **hard-pinned in the
  binder** instead of reading settings. Target: ONE capability descriptor (distinct reasoning/sampling/
  verbosity axes) drives translation AND panel; `resolveRole`. (Authoritative: `domains/connection.md`.)
- **providers** (infra): the pipeline knows each backend's guts (`dispatchAgentSdk`, seed-frames,
  per-runner name-stamping/cache); **custom-openai hardcodes** window/tier/thinking + assumes OpenAI
  response shape (despite a "user owns the truth" comment); embed/rerank/summarize/imageEmbed
  **vLLM-locked via the boot-binder default** (the role dispatchers themselves switch on
  `credential.source` — NOT hard-pinned; the lock is one rebind site) — still locks out no-GPU users;
  summarize as a separate engine. Target: roles are the firewall; sealed backends; vLLM = own multi-role
  engine; custom/BYO fully user-declared; hardware tiers. (Authoritative: `core/Tier-3b-Providers.md`.)
- **corpus → discovery** (6631 lines): name needs insider knowledge; **embeds + reads memory's digests**
  (incest); **writes `hub_score` back into memory tables**; `insights.ts` reads **raw `messages`** (the
  stats/discovery gray zone). Target: semantics only; consumes embeddings+search; embeds nothing;
  computes hub_score on embeddings rows. (Authoritative: `domains/memory.md`.)
- **search** (1632 lines): **4 ranking impls** (SQL `vector_distance_cos` + `vector-math.ts` all-pairs +
  `pair-cosine.ts` hand dot-loop + MiniSearch/BM25 `field-search`); split by _access pattern_, not domain.
  Target: ONE engine, two surfaces (vector + lexical); memory + discovery call it.
- **chat/memory** (1648 lines, a chat subsystem): full **parallel mini-corpus** — own embed + own cosine +
  own rerank; tier / mixA–C / §11.5 scoped-egocentric semantics that search's owner-wide scan doesn't
  model; schema named for the **consumer** (`chat_digests`/`chat_segments` live in `db/schema/search.ts`).
  Target: owns digest _generation_ + `{{memory}}` recall policy; delegates embed→embeddings, scan→search.
  **This is a rewrite, not a move — the tier/scoped semantics MUST survive.**
- **embeddings** (NEW — today scattered): **6 vector write sites across 5 tables** (corpus card ×2, image,
  theme centroids, memory digests, memory segments); the **reset-hubScore dance copy-pasted 3×**; no
  single write path. Target: `embeddings.store(kind, lens, key, content, model)` is the only inserter.
- **persona** (573 lines): `chats.personaId` is a **second home** that can diverge from the participant's
  active persona; `createFromCharacter` is a **lossy** `{{char}}↔{{user}}` string-swap;
  `chat_participants.activePersonaId` **dormant/unwired**. Target: active per-participant, anchor
  per-chat, attribution per-message; drop `chats.personaId`. (Authoritative: `participants-agents-identity.md`.)
- **character** (1795 lines): the **cv-pin** is woven through (`chats.characterVersionId` notNull);
  `cow.ts` CAS dance **exists only because chats pin**; `character_books` keyed on **cv** while
  `character_personas` keys on `characters.id` (deliberate book-snapshot semantics in neo — superseded
  by D28: no version table, so both key on `characters.id`). Target (**D28**): NO version table at all —
  the card is the flat `characters` row (read via `getCard`); `cow.ts` deleted; history = the
  `character_snapshots` log (browse/`restore`, gates nothing); all associations key on `characters.id`.
- **tag** (693 lines): **proposed = a parallel store** (JSON column) instead of a junction status —
  `proposedTags` is WIRED (import/seed/create/update write it, export reads it), just the wrong SHAPE;
  accepted `character_tags` don't round-trip to export; analytics facets conflated with labels. Target:
  one namespace + junctions; proposed = status; facets
  are `discovery`.
- **world-info** (1392 lines): the original "4 places" complaint — but **books-only + 4 scope junctions
  is the right shape**; per-entry behavior in a metadata JSON blob. Target: confirm it's already correct;
  the regex _library_ should mirror this exact pattern.
- **import** (2040 lines) / **export** (804 lines): **two drifting mappers** (role-map triplicated, WI
  mapping hand-duplicated, `creator`/`regex_scripts` survive only via a `raw` blob); import **emits no
  ContentChanged** (no auto-index); **two bulk loops** (zip route vs `import-st` workload); `proposedTags`
  round-trip gap (accepted tags don't export). Target: import+export share ONE serialization core; import
  is a canon-write that emits events.
- **stats** (1919 lines): economics only (tokens/cost/cache/timing) — clean, **zero vector tables** — but
  the line to discovery is **prose-only, not type-enforced**.
- **buddy** (2011 lines): ad-hoc **router/memory/prompt**; should be the first `agent`-role consumer (no
  hand-rolled router); in-process proposal map + rate-limit (`ASSUMES(single-replica)` — a NOTE, not a
  bug to fix). Target: buddy = an agent with tools + its own connection + a soul instead of a card.
- **credentials** (863 lines): logic **inverted into the `_shared` drawer**; should own resolve + CRUD +
  metadata in-feature.
- **workloads** (2744 lines): the execution engine; single-active partial index; runs in the dev server.
  Mostly the right shape — confirm and map to `transport/jobs` + the domain.
- **assets** (633 lines): the CAS **index** (table + verbs) vs the **byte I/O** (`infra/storage`) — keep
  the split clean.
- **sessions** (264 lines): auth/BFF sessions vs **SDK chat sessions** — a naming collision to resolve.
- **settings** (497 lines): env / AppSettings / UserSettings — the three typed tiers; confirm the floor
  rule (env floor, DB override wins).
- **admin** (554 lines): gating surfaces (`requireAdmin`, role).
- **debug** (309 lines): `/api/_debug` traces → this is **observability**, a `foundation` concern, not a
  domain.
- **`_shared`** (1907 lines, 19 files — THE DRAWER TO DISSOLVE; each file needs a destination verdict):
  `credentials.ts`/`user-settings.ts`/`role-clients{,−binder}.ts`/`admin.ts`/`users.ts`/`audit.ts`
  (cross-feature **services** → their own feature), `regex.ts`/`group-character-rows.ts`/
  `roster-rows.ts` (feature-internals → home), `ids.ts`/`strip-undefined.ts`/
  `batch.ts`/`errors.ts`/`db-errors.ts`/`fetch-owned.ts`/`replay-buffer.ts`/`stats-tally.ts`
  (primitives → `kit`; `replay-buffer` + `stats-tally` are pure `@orb/kit` primitives, NOT
  feature-internal — per Core-Laws-and-Precedents.md §7 D10), `content-hash` (→ `@orb/server/kit`, node-only-pure,
  NOT `@orb/kit` — per Core-Laws-and-Precedents.md §7 D9),
  `rate-limit.ts` (→ `transport`). **No `_shared` exists in orbweaver** — every file must land somewhere.

---

