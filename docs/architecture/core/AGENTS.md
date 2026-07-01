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

- `docs/architecture/core/Core-Laws-and-Precedents.md` §7 (D0–D38) — **canonical; wins on ANY conflict.**
- `docs/architecture/core/Core-Core-Core-Core-BUILD-PLAN.md` — the phase/wave order + per-phase checkpoints.
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
client     @orb/client     UI                                               → deps: kit, contracts, server(type-only)
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

5-package pnpm workspace under `packages/{kit,contracts,db,server,client}`; tests mirror under `tests/`.
Node 24 · pnpm 11 · TypeScript strict · Biome (ratcheted to MAX) · dependency-cruiser · vitest · lefthook.
Backend: Drizzle + libSQL · Zod · tRPC · `@anthropic-ai/claude-agent-sdk` · OpenRouter. Pinned versions +
the rationale live in `Core-Core-Core-BUILD-PLAN.md` §0 and the ledger — check there, don't assume.

## 4. The Pain Ledger (Historical Context)

Each entry: the **crunch** the remake must resolve. An agent reading that slice should confirm each pain
exists at file:line, note any that are stale, and surface esoteric/load-bearing details the ledger
misses (those feed the adversary).

- **chat** (16k lines — the integration point): the resolution **order is invisible** (split across
  `context.ts`/`assembly`/`engine/pipeline.ts`, no function says "this is the order"); WI **double-render**
  (`macro→regex→wrap→macro`) is a correctness trap; `assembleCtx` **mutated in place** (fragile per-speaker
  loop); **3 budget tallies** (WI-at-depth, system-half WI, completion fit) + unbudgeted chat_injections;
  guided steering = 6 actions / 2 paths / 3 override layers; the **breakpoint minefield**
  (`computeHistoryBreakpoint` off-by-one); the **name-stamp quartet** (`applyNamesBehavior`+`prefixNames`+
  `authorName`-smuggling+`truncateAtForeignLabel`); `runOnEdit` **unwired** (intent, not dead);
  render-context-null **silent raw fallback**; speaker-label re-derived in 3 places. Target: order is ONE
  explicit stage list; ONE injection list + ONE budget; two-phase immutable assemble; engines → `kit`.
  (Authoritative: `domains/chat.md`.)
- **connection / models** (`models` is 242 lines, folds in): connection **fragmented** across
  user-settings / chat-row / preset; **two capability systems** (`ChatModel` + `FAMILY_CAPS`,
  incompatible shapes, cross-merged); **reasoning collapsed into one cascade** (`effort:"none"` doubles
  as the off-switch; translated twice); `routing.ts` keyed on **`runner`** (infra-internal vocab leak);
  4 scattered `derive*Profile`; **panel ignores capabilities**; 5 roles + buddy **hard-pin** instead of
  reading settings. Target: ONE capability descriptor (distinct reasoning/sampling/verbosity axes) drives
  translation AND panel; `resolveRole`. (Authoritative: `domains/connection.md`.)
- **providers** (infra): the pipeline knows each backend's guts (`dispatchAgentSdk`, seed-frames,
  per-runner name-stamping/cache); **custom-openai hardcodes** window/tier/thinking + assumes OpenAI
  response shape (despite a "user owns the truth" comment); embed/rerank/summarize/imageEmbed
  **vLLM-hard-pinned** (no local-light, no hosted — locks out no-GPU users); summarize as a separate
  engine. Target: roles are the firewall; sealed backends; vLLM = own multi-role engine; custom/BYO fully
  user-declared; hardware tiers. (Authoritative: `core/Tier-3b-Providers.md`.)
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
  `character_personas` keys on `characters.id` (inconsistent). Target (**D28**): NO version table at all —
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
  feature-internal — per DECISIONS-LEDGER §7 D10), `content-hash` (→ `@orb/server/kit`, node-only-pure,
  NOT `@orb/kit` — per DECISIONS-LEDGER §7 D9),
  `rate-limit.ts` (→ `transport`). **No `_shared` exists in orbweaver** — every file must land somewhere.

---

## 5. The Cross-Cutting SPINE (Historical Context)

Some concerns aren't owned by one domain — they thread through many, and a per-domain reader must check
its slice against them rather than re-decide them. Each gets a **spine doc** (written before/with the
fanout); the fanout's readers + adversary treat these as fixed targets. (These join the existing cluster
docs — `domains/chat.md`, `domains/connection.md`, `core/Tier-3b-Providers.md`, `participants-agents-identity.md`,
`domains/memory.md` — as the checkable target surface.)

### 7.1 identity / auth / permission _(see `core/Spine-Identity-and-Auth.md`)_

Findings that fix the target:

- **Resolve identity ONCE at the edge → one immutable `Principal` flows down.** Today it's resolved
  **twice per request** (`provisionIdentity` computes the row id keyed on `externalId`, then
  `createContext` throws it away and re-resolves by `handle` via `ensureUser`), across **3 principal
  shapes** (`ResolvedIdentity → AuthContext → Context`) with `role`/`userId` duplicated. Carry `userId`
  out of `resolve()`; never re-query. The 4 auth modes are already clean (one dispatcher, one branch
  point — keep).
- **Permission = global-role × resource-role × capability** (only the first is wired today). Global
  `admin|user` is real + 2-layer enforced (`adminProcedure` + `requireAdmin`). The per-resource
  `chat_participants.role: host|member` **exists in schema but gates NOTHING** ("added-but-unwired").
  Access control today is **pure single-owner row-scoping** (`chats.ownerId === ctx.userId` via
  `loadOwnedChat`) — the exact assumption that breaks for multi-human + agents. Target: wire `host|member`
  as chat authority; replace owner-equality with **participant-membership**; introduce a real
  `can(principal, action, resource)` seam instead of scattered `role===admin` / `ownerId===userId`.
- **LOCKED (user decision): agents are FIRST-CLASS PRINCIPALS** _(the MODEL is locked; the agent-principal
  MINT mechanics are DEFERRED to v2 — v1 ships the borrowed-owner posture, ledger §3/§5/D17. This file is a
  non-authoritative digest; the ledger + spine docs win on any conflict)._ Today the buddy is NOT a `users` row —
  it's a per-owner row (`buddies.userId → users.id`) acting **as the owner** (kill-switch + propose/confirm
  gate + in-process rate-limit, firewalled OUT of chat `messages`). Orbweaver makes an agent a **real
  principal**: its own `users` row + identity, a seat in `chat_participants`, **self-attributed messages**
  (`authorUserId` = the agent, not the owner). This unifies with multi-human (both want
  `chat_participants` to carry authz + `authorUserId` to mean the real author) — ONE model, not two. The
  blast radius (grounded by the principal-ripple dig): the `chat_participants.kind` enum + XOR check, the
  `authorUserId` stamping path, `loadOwnedChat`'s owner-equality access predicate, the `buddies`-table
  plumbing, and the roster builders all change. Preserve the safety the borrowed-identity model gave for
  free (an agent principal still needs a capability ceiling + the confirm gate — it must not silently
  exceed what its actions should do); that's now enforced by the permission model (global×resource×capability)
  rather than by "it's just the owner."
- **Esoteric to preserve:** `externalId` keys SSO / `handle` keys the rest (rename stability); the
  owner-fallback is bootstrap AND an origin-gated security belt (`viaFallback` is the safe "this is the
  owner" discriminator, NOT `externalId===null`); JWKS fails-closed 3 ways; CSRF keys on `viaCookie`;
  credential AAD binds `(userId, provider)`; the `max-pro-sub` gate is the only construction site (admin-gated in neo-source today → `requireOwner` in orbweaver, D17).
- **BFF session ≠ SDK chat session** — keep the two "session" concepts firmly separate (identity vs
  prompt-cache lineage); the schema already calls this out.

### 7.2 settings / config / the env FOUR natures _(see `core/Spine-Config-and-Serialization.md`)_

The four natures confirmed, and the headline: **a fourth nature has NO home today.**

- **(a) true env** — boot/secret/identity (the one `process.env` reader; keep, with the
  `superRefine` boot-fatality per `AUTH_MODE`). Sub-nature **(a/seed)**: env that writes a DB row once
  then goes inert (`OPENROUTER_API_KEY` → labeled credential) — the cleanest env→DB pattern; **keep as the model.**
- **(b) runtime toggles → AppSettings** (env floor, DB override wins, via `layer()` + a versioned blob).
  **Stranded today (env-only, should be AppSettings):** `IMPORT_DEFAULT_SOURCE`, `RATE_LIMIT_*`,
  `VLLM_*_CONCURRENCY`. Also: "env is the floor" is only **half-true** — `envDefaults()` mixes
  env-mirrored toggles with born-in-DB defaults (floor for 3 of 7 fields).
- **(c) agent-sdk runtime config — THE homeless nature.** ~13 isolation pins + an 11-key reserved-denylist
  - the 3-mode credential firewall (200+ lines, **security-load-bearing, rebuilt every turn**), today
    hardcoded literals in `providers/claude-sdk/env.ts`, called "env" only because it _emits_ env vars.
    Target: **extract into a named backend-internal config of the claude-sdk strategy** — NOT a settings
    tier. (This is the credential firewall that must never leak the sub — handle with care.)
- **(d) generation params** — `UserIntent`/preset, translated per-backend. **CLAUDE.md claim verified
  TRUE:** reasoning is typed SDK Options, not env (`effort`/`thinking`); only `maxOutputTokens`/
  `maxContextTokens`/compaction ride env, and they're preset-sourced (env-_shaped_ only at the wire).
- **Tangle to undo:** `claudeRuntimeEnv()` mixes (c)+(d) in one object; `OPENROUTER_API_KEY` wears 3 hats
  (secret/seed/live-client-read); `UserIntent.advanced.claudeEnv` is a preset (d) field reaching into (c),
  gated by a runtime denylist not a type. **Keep:** all 3 tiers share ONE `defineVersionedConfig`
  primitive; memory tuning is correctly split write-side (AppSettings) vs read-side (UserSettings).

### 7.3 serialization / serde core _(see `core/Spine-Config-and-Serialization.md`)_

Recon **corrected the first read** — two of the "3 card shapes" are a _justified_ emit/read pair, and the
PNG codec is _not_ scattered. The real findings:

- **Card shape — LOCKED: unify into ONE fully-modeled canonical card in `contracts`.** (User: "we can
  support them now in full.") Recon found three shapes — the V3 emit schema (`export/contract/card-v3.ts`),
  the permissive `ParsedCard`/`RawCard` reader (`import/card.ts`), and the disjoint app-CRUD schema
  (`shared/character/character-schema.ts`) — with `creator`/`character_version`/`regex_scripts`/
  `extensions` surviving **only via the `raw` blob** (so app-authored cards drop them). Target: model the
  **FULL card as typed fields/columns** (promote creator/cardVersion/regex_scripts/extensions/book) so
  app-authored AND imported cards round-trip identically. The permissive `RawCard` reader stays — but
  only as a **tolerant input adapter that normalizes INTO the one canonical model**, not a parallel lossy
  shape; `raw` is reserved for genuinely-unknown vendor extras, not for fields we now model. Kills the §6
  lossiness + the shape-C disjointness in one move.
- **PNG codec:** only **two sites** (a pure read half in `card.ts`, a pure write half in `export/png.ts`)
  — a read/write pair, not duplication. The chunk-walk loop + `isPng` + `PNG_SIGNATURE` are copied, and
  a 3rd `isPng` is inline in `http/import.ts`. Target: ONE `kit/png-card-chunk` engine
  (`readCardChunk(bytes)→string` / `writeCardChunk(png, jsonString)→bytes`) — **string-based, so the
  codec never imports the card type** (the layer-cake caveat). First lift the read half out of `card.ts`
  (away from the server logger + mappers).
- **The REAL strandings:** the **preset ST-mapper** (`shared/prompt/st-preset.ts` + `preset-file.ts`) is
  client-only, **zero server consumers**, never touches import/export — the clearest stranded mapper. And
  **regex-script "mapping" doesn't exist** — card `regex_scripts` are raw-blob passthrough only (parsed,
  never columned), despite a real `regexScriptSchema` existing.
- **Triplication (textbook):** the ST numeric role-map `{0:system,1:user,2:assistant}` is written **4×**
  (`persona.ts`, `lore.ts`, `card-v3.ts` inverse, `card.ts` inline). One bimap in `contracts`/`kit`.
- **Lossiness to FIX (not just tidy):** `creator`/`character_version`/`regex_scripts` survive only via
  the `raw` blob → an **app-authored** card (no `raw`) drops them on export. Accepted tags diverge from
  proposed (`proposedTags` re-exports, accepted `character_tags` junction doesn't). Promote those to
  typed columns.
- Target: SHAPES → `contracts` (the emit/read pairs + ST preset shape co-located); CODEC → pure `kit`
  (string-based); per-entity MAPPERS consolidated & shared by import+export (role-map, WI-entry mapper,
  card pair); the import↔assets bulk glue (duplicated in `http/import.ts` + `import-st.ts`) → one
  composition-layer helper. **Already clean (don't touch):** the parse/write split, the shared
  chat-writer, idempotency hashing.

### 7.4 types & schemas — one home, one direction, no inline _(see `core/Spine-TypeScript-and-Patterns.md`)_

The problem: a shape's "home" is ambiguous — drizzle schema in `db`, re-declared/re-exported in `shared`,
each domain has its own `contract/`, and the client needs some shapes for client-side validation. So
shapes get duplicated and inline types/schemas sprout everywhere. The target rule (**one home per shape,
derived by who needs it; flows DOWN only**):

| Shape kind                                                | Home                                                    | Consumers (down only)         |
| --------------------------------------------------------- | ------------------------------------------------------- | ----------------------------- |
| **DB row**                                                | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence            |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS)                         | server, client, other domains |
| **domain-internal**                                       | that domain's `contract/` (params/results/views/errors) | only that domain              |
| **client-only view**                                      | client                                                  | client                        |
| **pure primitive shape**                                  | `kit`                                                   | anyone (it's the bottom)      |

**The gate — `no-inline-types`:** no exported `type`/`interface`/`z.object` (and no structural cast)
declared OUTSIDE `db` schema / `contracts` / a domain's `contract/` / `kit`. Inline shapes in `verbs/`,
`persistence/`, `service.ts`, transport, or client components are RED. This is the enforced version of
"no schemas or types outside their proper places." Readers flag every leak (§6B `inlineTypes`); the
spine doc defines the exact gate.

### 7.5 string-union dispatch discipline _(NEW thread — grounded by the AST dispatch scout)_

The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. The scout
**quantified the "touch N spots to add one variant" pain** (`reports/dispatch-scout.json`):

| axis                                  | touch-count | shape of the rot                                                                                                                  |
| ------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `messageRole` (system/user/assistant) | **132**     | 3 competing canonical const-arrays + 116 inline re-spellings; no importable union                                                 |
| `users.role` (admin/user)             | 35          | no exported `UserRole` union → 33 inline `"admin"\|"user"` re-decls                                                               |
| `guidedAction` (6)                    | 23          | 14 redecls + 4 **untyped** `Record`s (no exhaustiveness backstop)                                                                 |
| `routing.source` (4)                  | **18**      | **the user's lived pain, MEASURED** — 11 inline re-decls of the source union (dispatch IS gated; the cost is pure re-declaration) |
| `routing.api` (3)                     | 12          | 9 inline re-decls (dispatch fully `assertNever`-gated)                                                                            |

**The GOLD STANDARD to copy (already right):** `workloads.kind` dispatches through
`RUNNERS: { [K in WorkloadKind]: Runner<K> }` — a **mapped-type Record**, so a missing kind is a hard
`tsc` error. `routing.api`/`source` runner switches use typed-return / `assertNever`. **Target rule:**
every axis has (a) ONE importable canonical union/tuple (no inline re-spelling — gated), and (b) a
mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build). The leaky axes
(`messageRole` switches, `guidedAction` untyped Records, the `authMode`/`runner` if-chains) convert to
that shape. This is its own gate candidate: **`no-inline-union-redecl` + `exhaustive-dispatch`.**

---

## 6. Grounded Intelligence (Historical Context)

Eight whole-file/AST investigations ran (3 deep recons: auth · env · serde; 4 AST agents: coupling ·
type-census · dispatch · chat-map; 1 escape-hatch scout). Reports live in neo-tavern `reports/*.json`.
The instrument: **`scripts/codemods/codemod-kit.ts`** (the ts-morph toolkit — `createCodemodProject` +
`findImporters`/`findReferencesByName`/`findCallSites`/`listExports` + preview/apply harness) and the
**scout pattern** (`chat-domain-scout.ts` → emit JSON to `reports/`, slice with `jq`). **The fanout
readers REUSE this kit** — never hand-roll ts-morph bootstrap.

**8.1 Coupling is already clean — the rewrite is NOT decoupling features.** 1654 files, 8378 edges,
**zero cross-feature deep imports, zero domain→transport edges; `chat` imports no sibling feature**
(fan-out 0; fan-in 7, 100% front-door). Feature boundaries are already enforced + respected. The real
structural work:

- **Re-home the `_shared` drawer** (it has no front door, so its 221 "violations" are all just drawer
  reaches): `audit`(61 importers)/`ids`(58)/`errors`(54) → foundation/kit primitives; `role-clients`(29,
  all type-only) → the role-dispatch **contract** (infra-facing); `credentials`(25) → `domain/credentials`;
  `roster-rows`/`group-character-rows` → chat-private (misfiled); `batch`/`fetch-owned`/`db-errors` → db-kit.
- **`providers/contract/*` has NO barrel** → 25 of 32 provider deep-reaches are loose contract files; add
  `providers/contract/index.ts` (one front door seals the executor). Move `providers/_shared/vector-math.ts`
  → a math `kit` (5 consumers want cosine, not a provider). Move the 2 `DEFAULT_*_MODEL_ID` constants off
  `providers/index.ts` (kills the lone foundation→infra edge).
- **`workloads/contract/runner-env.ts`** is the one true cross-feature hub (the composition seam) — model
  it explicitly, keep it.

**8.2 Type/schema fragmentation (thread #4, grounded).** 1312 shape declarations. **57 cross-boundary
leaks** (exported shapes outside a proper home — top: `RoleClients`(19 refs), `Cas`(12), `SecretBox`(11),
`ChatBusEvent`(10), `MemoryConfig`(10)) + **181 over-exported locals** (down-scope, don't move — separate
workload). **31 duplicate-shape clusters**; the deepest is the **import↔export↔engine triangle** —
world-info entry (6×), chat message/variant (5×), character card (4×) re-declared because parse/serialize/
runtime never agreed on a contract shape. Plus the **client hand-redeclares server zod** (custom-OpenAI
metadata, asset result, browse filter). Identity/principal is fragmented too but DODGED the property-set
clustering (different field names for the same concept — `AuthContext`/`IdentityResolution`/`OwnerResolution`)
→ needs a manual reconcile. **Zero `enum`s anywhere** (all string-unions — good, keep).

**8.3 Chat resolution (all `domains/chat.md` claims CONFIRMED with file:line).** (a) Order **split across 3 files
with no single owner** — `assembly/context.ts` (macro#1 + WORLD_INFO regex + WI→injection + budget),
`assembly/assemble.ts` (section walk + macro#2 + framing + static/dynamic split), `engine/pipeline.ts`
(USER_INPUT regex → splice→squash→name-stamp→fit → AI_OUTPUT/REASONING regex), sequenced by `engine.ts`'s
loop; doctrine is prose-only. (b) **16 in-place mutation sites** on `prep.assembleCtx`, all in pipeline.ts
(applyInputs×6, setSpeaker×5, setNarrator×4, after-history×1); the per-speaker loop depends on re-reading
the mutated ctx → confirms the two-phase-immutable target. (c) **Name-stamp is a quartet-PLUS (5
mechanisms)** across names.ts/speaker-stamp.ts/store.ts/frames.ts/engine.ts. (d) Chat's only deep
reach-arounds are into `providers/contract/*` + `resolve-chat.ts` + `vector-math.ts` (mostly type-only) —
fixed by the providers barrel (8.1).

**8.5 Knowledge cluster (all claims CONFIRMED — `reports/knowledge-scout.json`).** 6 vector-write sites
across 5 tables; the embed→null-filter→upsert→**reset-hubScore** dance is duplicated in the **2 memory
writers** (`memory/db.ts`, `memory/generate.ts`) — corpus writers deliberately DON'T reset (advisory).
4 ranking impls (SQL `vector_distance_cos` scan · `vector-math.ts` all-pairs · `pair-cosine.ts` dot loop ·
MiniSearch/BM25 `field-search`); memory's recall uses the in-RAM `cosineSim` path, NOT the SQL scan search
uses — **two cosine paths over the same `chat_digests` table.** `hub_score` seam confirmed: `hubness.ts`
is the ONE writer (4 tables), search verbs the readers, memory nulls-on-write. Schema-naming lie confirmed:
`character_embeddings`/`image_embeddings`/`chat_digests`/`chat_segments`/`chat_digest_speakers` ALL live in
`db/schema/search.ts` (named for the consumer). **The preservation RISK (the reshape's central tension):
memory has 6 query semantics search's owner-wide scan does NOT model** — (1) the 5 recall modes
(off/mixA/mixB/mixC/tiered); (2) the tiered consolidation "bridge" (uncovered-digests-only); (3)
verbatimWindow/protected-tail; (4) egocentric scoped-query construction (POV bucket + name-prefixed query);
(5) in-chat single-chat focus (`WHERE chat_id` + in-RAM scoring vs owner-wide `WHERE owner_id`); (6)
keywordMatch/recencyBias/minScore. `stats` touches ZERO vector tables (confirmed); the gray zone is
`corpus/insights.ts` reading raw `messages` for economics-flavored aggregates.

**8.6 First-class-principal blast radius (grounded — `reports/principal-scout.json`).** THE load-bearing
finding: **`chat_participants.kind` is OVERLOADED** — it means BOTH identity-table (users vs characters)
AND human-vs-AI at once (`human`≡has-userId, `character`≡has-characterId, enforced by the XOR check). An
agent principal is _both_ userId-backed _and_ AI-driven, which is **currently unrepresentable** (the XOR
forbids a row with both a userId and a card link; arbitration only considers `kind:"character"`). The fix:
split the two meanings — a `kind:"agent"` (or an `isAi`/`principalKind` axis distinct from identity-table).
The `parseParticipant` `never` exhaustiveness guard + the XOR CHECK are the tripwires that enumerate the
work. Also: **`authorUserId` is NEVER stamped on the live send path** (only the one-time backfill, hardcoded
to owner) — so threading a real **principal-id** (≠ the access `userId`) into the persist path is a NEW
build. `role:host|member` confirmed **unwired** (33 writes, 0 authority reads) — it's the per-resource axis
to wire. **6 NEW builds** vs modifications: `provisionAgentPrincipal` (mint a non-SSO users-row from inside
the app — precedent: the `__group__${chatId}` synthetic namespace), a `users.isAgent`/`kind` column +
non-loginable semantics, `requireParticipant`/`requireHost` predicates (replacing the 45 `loadOwnedChat`
owner-equality sites — split resource-load from authority-check), principal-id threading, the agent seat
that's userId-backed yet AI-arbitrated, and the `buddies.userId` owner-link-vs-own-principal split (the
`buddy_turns` firewall inverts — an agent principal CAN write to `messages`). Credential inheritance (does
an agent inherit the owner's `max-pro-sub` tier?) is a flagged decision, not mechanical.

**8.7 Doc-claim verification round (the detail docs are now re-grounded).** Four agents re-checked every
un-verified assertion in `domains/connection.md`/`core/Tier-3b-Providers.md`/`participants-agents-identity.md`/
`domains/chat.md` against the AST. Most CONFIRMED; **6 corrected** (docs patched): (1) providers role dispatchers
are NOT vLLM-hard-pinned — they `switch (credential.source)`; the lock is a boot-binder default → the
multi-backend target is a one-site rebind, not a dispatcher rewrite; (2) `character_books`-on-cv vs
`character_personas`-on-id is **deliberate** in neo (book-snapshot semantics) → **superseded by D28**:
orbweaver has no version table, so both key on `characters.id` and the live card's book set is read at assemble; (3) "collapses most of cow.ts" → only the fork/CAS branch (~half); (4) chat
has **2** budget tallies not 3 (WI is already one unified walk); (5) `3` `derive*Profile` not 4; (6) the
params panel already has coarse source-level gating to build on. CONFIRMED-as-written: two-capability-
systems, reasoning-one-cascade (`effort:"none"`=off), translated-twice, `routing`-on-`runner`,
`resolveChat`-funnel, custom-openai hardcoding, `runner`=f(api,source), summarize-as-shaper, the vLLM
supervisor, `createFromCharacter` lossy (conditional on `swapMacros`), cow-exists-because-pin,
`characterVersionId` NOT NULL, primary-is-the-holdout, synthetic group char, WI double-render, guided
6-actions/2-paths/3-layers/opening-carveout/splice-convert, `computeHistoryBreakpoint` 1-invariant+3-aborts,
`runOnEdit` unwired, render-ctx-null fallback, `isSectionDynamic` split.

**8.4 Escape hatches — the backend is remarkably clean (the bar is high).** server+shared+db: **1 `any`,
0 `@ts-ignore`, 3 non-null `!`** — the entire surface is `as` casts (333). The dangerous work is FOUR
clusters: (1) inline `BatchItem<"sqlite">` tuple casts that bypass the existing `batchMany` helper (~59,
the clearest "abstraction exists, cast is laziness" — highest priority, on the chat send/persist path);
(2) corpus numeric-kernel index defeats (~49, pure math); (3) chat SDK-frame serialization double-casts
(`store.ts`/`frames.ts` — cache-lineage-critical → needs a typed frame model); (4) DB-row read-seam casts
(`r.model as string` → zod-parse like `parseProviderMetadata` already does). **LOAD-BEARING (preserve +
promote):** the credential/brand firewall — the `max-pro-sub` mint is the ONLY construction site
(`_shared/credentials.ts:565`, right after the admin gate); the rewrite should make the privileged variant
**unconstructable except behind the role check** (tier-1), so the `as` vanishes. TypeID brand discipline
is already biome-plugin-enforced (`no-raw-id`/`no-loose-id-cast`). The **zod-parse-at-the-wire/DB-seam**
pattern (`parseProviderMetadata`) is the model to generalize. Clean zones (the bar): `world-info`(0 `as`),
`persona`/`preset`/`models`/`credentials` services (≤1).

---

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

- **archive/**
  - [COUNCIL-REVIEW.md](docs/architecture/archive/COUNCIL-REVIEW.md)
  - [DECISIONS-LEDGER.md](docs/architecture/archive/DECISIONS-LEDGER.md)
  - [DOC-REVIEW-FINDINGS-2026-06-28.md](docs/architecture/archive/DOC-REVIEW-FINDINGS-2026-06-28.md)
  - [ENFORCEMENT.md](docs/architecture/archive/ENFORCEMENT.md)
  - [INCONSISTENCY-AUDIT.md](docs/architecture/archive/INCONSISTENCY-AUDIT.md)
  - [PRE-SCAFFOLD-CHECKLIST.md](docs/architecture/archive/PRE-SCAFFOLD-CHECKLIST.md)
  - [PROMOTION-DEBT.md](docs/architecture/archive/PROMOTION-DEBT.md)
  - [boundary-scan.md](docs/architecture/archive/boundary-scan.md)
  - [client-tanstack-form-examples.md](docs/architecture/archive/client-tanstack-form-examples.md)
  - [client-tanstack-form-notes.md](docs/architecture/archive/client-tanstack-form-notes.md)
  - [client-tanstack-query-examples.md](docs/architecture/archive/client-tanstack-query-examples.md)
  - [client-tanstack-query-notes.md](docs/architecture/archive/client-tanstack-query-notes.md)
  - [client-tanstack-router-notes.md](docs/architecture/archive/client-tanstack-router-notes.md)
  - [client-tanstack-virtual-notes.md](docs/architecture/archive/client-tanstack-virtual-notes.md)
  - [client-zustand-notes.md](docs/architecture/archive/client-zustand-notes.md)
  - [client.md](docs/architecture/archive/client.md)
  - [event-bus-st-parity.md](docs/architecture/archive/event-bus-st-parity.md)
  - [identity-auth-permission.md](docs/architecture/archive/identity-auth-permission.md)
  - [serialization-core.md](docs/architecture/archive/serialization-core.md)
  - [settings-and-config.md](docs/architecture/archive/settings-and-config.md)
  - [shared-dissolution.md](docs/architecture/archive/shared-dissolution.md)
  - [sillytavern-feature-gap.md](docs/architecture/archive/sillytavern-feature-gap.md)
  - [string-union-dispatch.md](docs/architecture/archive/string-union-dispatch.md)
  - [testing.md](docs/architecture/archive/testing.md)
  - [types-and-schemas.md](docs/architecture/archive/types-and-schemas.md)
  - [typescript-style.md](docs/architecture/archive/typescript-style.md)
- **core/**
  - [AGENTS.md](docs/architecture/core/AGENTS.md)
  - [Core-0-Architecture-and-Structure.md](docs/architecture/core/Core-0-Architecture-and-Structure.md)
  - [Core-Audits-and-Debt.md](docs/architecture/core/Core-Audits-and-Debt.md)
  - [Core-BUILD-PLAN.md](docs/architecture/core/Core-BUILD-PLAN.md)
  - [Core-Laws-and-Precedents.md](docs/architecture/core/Core-Laws-and-Precedents.md)
  - [Core-Legacy-Migration-and-Gaps.md](docs/architecture/core/Core-Legacy-Migration-and-Gaps.md)
  - [Core-Planning-and-Checklists.md](docs/architecture/core/Core-Planning-and-Checklists.md)
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
