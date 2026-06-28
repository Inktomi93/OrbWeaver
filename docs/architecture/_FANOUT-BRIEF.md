# Orbweaver — fanout brief (the shared input for every recon agent)

> **Status: planning. This is the single source handed to every fanout agent.** It condenses the
> orbweaver target (the constitution + the map), states the ONE hard constraint, gives the placement
> decision rule, and carries the per-domain **pain ledger** so an agent reading one neo-tavern slice
> knows that slice's pains without reading all eight architecture docs. The authoritative docs
> (`structure.md`, `domains.md`, and the four cluster docs) win on any conflict — this is a digest, not
> a replacement.
>
> **neo-tavern** = the live code being remade (`/home/inktomi/inktomi-stack/development/neo-tavern`).
> **orbweaver** = the target (`/home/inktomi/inktomi-stack/development/orbweaver`). Scope of this pass:
> neo-tavern **`src/shared` + `src/db` + `src/server`** ONLY. `src/client` is excluded — it is a fresh
> rebuild, intentionally not ported.

---

## 1. The target (condensed — full detail in `structure.md` §2–4, `domains.md`)

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
`parseSpeakerSpans`). **Engine vs data:** the engine is `kit`; the *data* it runs on
(`MacroContext` values, the regex *script library*) is a domain. One engine, two call sites (server
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

**Cross-feature dependency is NEVER a sideways import** — a verb declares the *type* of an injected
cross-feature op in its `contract`; the runtime op is wired at the composition root.

---

## 2. THE HARD CONSTRAINT — one-directional flow, enforced multiple ways

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

## 3. The placement decision rule (what each agent decides per unit of code)

For every meaningful unit (a file, a function cluster, a table, a subsystem), classify the destination:

| Outcome | When |
|---|---|
| **stays a domain feature** | it's business logic with one owner; fits the 8-slot template |
| **→ `kit`** | pure, zero-I/O, zero-domain, multiple consumers (an engine or a primitive) |
| **→ `contracts`** | a cross-boundary *type/shape* both server and client (or two domains) need |
| **→ `infra`** | external I/O adapter (a provider, crypto, storage, network, auth verification) |
| **→ `foundation`** | env / config / observability — read down-into by all, reaches up to none |
| **→ another feature** | it's a misfiled internal of a different domain |
| **merge / rename / split** | two homes for one concept (merge); a name needing insider knowledge (rename); one folder doing two jobs (split) |

**"Unwired ≠ worthless" (load-bearing):** "no consumer / dead / unwired" is a prompt to evaluate
**intent**, not a delete signal. Much of it is SillyTavern-inherited or scaffolded intent that never got
wired (`runOnEdit`, the non-chat `roleDefaults`, `chat_participants.activePersonaId`, the
declared-but-never-emitted `WiBusEvent` entry variants).
Default to **understand the intent → wire or modernize**; flag-for-delete only when genuinely superseded
residue, and say why.

**The partitioning rule (the worst neo-tavern crunches, pre-decided — confirm or challenge against the
real code):**

| Concept | Orbweaver home |
|---|---|
| connection (api/source/model/providerRouting) | `connection` domain (NEW; absorbs `models`) |
| generation config (params/sections) | `preset` (never the connection) |
| credential | `credentials` (un-inverted — owns resolve+CRUD+metadata) |
| roles (chat/embed/rerank/summarize/imageEmbed/generateImage/agent) | one `resolveRoleConnection(role)` |
| regex | a regex *library* + scope junctions; engine is `kit/regex` |
| world info | one books/entries store + scope junctions (already right) |
| descriptive labels | `tag` (proposed = a *status*, not a parallel store) |
| semantic facets (genre/tone/themes) | `discovery` (rename of `corpus`) |
| derived vectors | `embeddings` (NEW — the one write path + one 1024-dim space) |
| per-chat recall | `chat/memory` (delegates embed→embeddings, retrieve→search) |
| retrieval | `search` (the one engine: vector + lexical) |
| turn economics | `stats` (zero vector tables) |
| character versions | NO version table (D28) — flat `characters` card row; history = `character_snapshots` (browse/restore, gates nothing) |

---

## 4. The pain ledger (per slice — verified by prior recon; confirm against the code, add what's new)

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
  translation AND panel; `resolveRoleConnection`. (Authoritative: `domains/connection.md`.)
- **providers** (infra): the pipeline knows each backend's guts (`dispatchAgentSdk`, seed-frames,
  per-runner name-stamping/cache); **custom-openai hardcodes** window/tier/thinking + assumes OpenAI
  response shape (despite a "user owns the truth" comment); embed/rerank/summarize/imageEmbed
  **vLLM-hard-pinned** (no local-light, no hosted — locks out no-GPU users); summarize as a separate
  engine. Target: roles are the firewall; sealed backends; vLLM = own multi-role engine; custom/BYO fully
  user-declared; hardware tiers. (Authoritative: `tiers/providers.md`.)
- **corpus → discovery** (6631 lines): name needs insider knowledge; **embeds + reads memory's digests**
  (incest); **writes `hub_score` back into memory tables**; `insights.ts` reads **raw `messages`** (the
  stats/discovery gray zone). Target: semantics only; consumes embeddings+search; embeds nothing;
  computes hub_score on embeddings rows. (Authoritative: `knowledge-cluster.md`.)
- **search** (1632 lines): **4 ranking impls** (SQL `vector_distance_cos` + `vector-math.ts` all-pairs +
  `pair-cosine.ts` hand dot-loop + MiniSearch/BM25 `field-search`); split by *access pattern*, not domain.
  Target: ONE engine, two surfaces (vector + lexical); memory + discovery call it.
- **chat/memory** (1648 lines, a chat subsystem): full **parallel mini-corpus** — own embed + own cosine +
  own rerank; tier / mixA–C / §11.5 scoped-egocentric semantics that search's owner-wide scan doesn't
  model; schema named for the **consumer** (`chat_digests`/`chat_segments` live in `db/schema/search.ts`).
  Target: owns digest *generation* + `{{memory}}` recall policy; delegates embed→embeddings, scan→search.
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
  the regex *library* should mirror this exact pattern.
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

## 5. The work-list (the slices the fanout fans over)

**`server/domain/*` (20 readers; chat sub-split):**
admin · assets · buddy · character · **chat** (split into 6 sub-readers: `engine` 4515 · `verbs` 3830 ·
`assembly` 2440 · `memory` 1648 · `persistence` 1600 · `contract`+top-level 1023) · corpus · credentials
· debug · export · import · models · persona · preset · search · sessions · settings · stats · tag ·
workloads · world-info. Plus **`_shared`** (the dissolve-analysis slice — verdict per file).

**`server/` infra + foundation tier (full coverage this pass):**
`providers` · `auth` + `auth-context.ts` · `crypto` · `network` · `storage` · `observability` (+ the
`debug` domain folds here) · `config` · `env.ts` · `http` · `jobs` · `trpc` · loose files
(`content-hash.ts` 71 · `lifecycle.ts` 317 · `version.ts` 7).

**`shared/*`:** prompt (15 files) · `_kit` (12) · settings (7) · contracts (5) · providers (4) ·
world-info (3) · buddy (3) · persona (2) · character (2). (Maps onto orbweaver `kit` / `contracts` /
per-domain `contract/`.)

**`db/`:** `schema/*` (20 files) + `client.ts` · `vector-ops.ts` · `insert-chunk.ts` · `parsers.ts` ·
`custom-types.ts` · `relations.ts`. Schema-naming lies to flag (e.g. `chat_digests`/`segments` in
`search.ts`); the cv-pin column + the whole `character_versions` table (gone — D28); `chats.personaId`; the F32_BLOB exact-scan note.

---

## 6. Output contracts (what each phase returns)

**READER** (whole-file, general-purpose — read top-to-bottom, NOT grep-skim):
```
{ slice, owns[], publicSurface[], crossFeatureImports[{from, to, why}],   // the directional truth
  tables[], inlineTypes[{file:line, shape, shouldLiveIn}],                 // §7.4 — types/schemas declared outside contract/db
  pains[{ledgerItem|new, file:line, confirmed|stale, note}],
  abstractionFit[{unit, verdict: "over"|"under"|"right", note}],          // §6B — collapse / needs-a-seam / fine
  esoteric[{file:line, whatBreaksIfIgnored}] }                            // load-bearing quirks
```
**DOC-WRITER + PLACEMENT** (recon + this brief):
```
{ orbweaverDoc,                                                            // template-shaped per-domain doc
  placements[{ unit, outcome(§3), target, rationale, enforcementTier }] }  // EVERY move names its enforcer
```
**ADVERSARY** (holds BOTH the orbweaver docs AND the recon reality+pains — **propose-only**):
```
{ verdict: "agree" | "disagree+alternative" | "esoteric-flag",
  fired_on: ["one-directional-violation" | "esoteric-knowledge" | "better-division"],
  refutation, alternative?, evidence:file:line }                          // disagree ⇒ MUST propose an alternative
```
Triggers the adversary fires on: (a) a placement that **violates one-directional flow** / needs an upward
import; (b) **esoteric knowledge** in the recon the docs ignore that breaks the clean split; (c) a
**genuinely better division**. It never just vetoes — disagreement carries an alternative + evidence.
I reconcile every contested boundary in synthesis (the adversary does not patch).

### 6B. Two extra verdicts every reader/writer carries

- **Abstraction-fit** — for each unit: **over-abstracted** (an indirection/wrapper/registry earning
  nothing → collapse it), **under-abstracted** (duplicated logic / a missing seam → extract it), or
  **right**. "Consider EVERYTHING in server" — the whole tree, not just `domain/*`, gets this verdict.
- **Inline-type leak** — every `type`/`interface`/`z.object`/cast declared OUTSIDE its proper home
  (§7.4) is flagged with where it should live. Feeds the `no-inline-types` gate.

---

## 7. The cross-cutting SPINE (target docs the per-domain fanout DEFERS to)

Some concerns aren't owned by one domain — they thread through many, and a per-domain reader must check
its slice against them rather than re-decide them. Each gets a **spine doc** (written before/with the
fanout); the fanout's readers + adversary treat these as fixed targets. (These join the existing cluster
docs — `domains/chat.md`, `domains/connection.md`, `tiers/providers.md`, `participants-agents-identity.md`,
`knowledge-cluster.md` — as the checkable target surface.)

### 7.1 identity / auth / permission  *(recon complete — `spine/identity-auth-permission.md` to be written)*
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
- **LOCKED (user decision): agents are FIRST-CLASS PRINCIPALS** *(the MODEL is locked; the agent-principal
  MINT mechanics are DEFERRED to v2 — v1 ships the borrowed-owner posture, ledger §3/§5/D17. This file is a
  non-authoritative digest; the ledger + spine docs win on any conflict).* Today the buddy is NOT a `users` row —
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

### 7.2 settings / config / the env FOUR natures  *(recon complete — `spine/settings-and-config.md` to be written)*
The four natures confirmed, and the headline: **a fourth nature has NO home today.**
- **(a) true env** — boot/secret/identity (the one `process.env` reader; keep, with the
  `superRefine` boot-fatality per `AUTH_MODE`). Sub-nature **(a/seed)**: env that writes a DB row once
  then goes inert (`OPENROUTER_API_KEY` → labeled credential) — the cleanest env→DB pattern; **keep as the model.**
- **(b) runtime toggles → AppSettings** (env floor, DB override wins, via `layer()` + a versioned blob).
  **Stranded today (env-only, should be AppSettings):** `IMPORT_DEFAULT_SOURCE`, `RATE_LIMIT_*`,
  `VLLM_*_CONCURRENCY`. Also: "env is the floor" is only **half-true** — `envDefaults()` mixes
  env-mirrored toggles with born-in-DB defaults (floor for 3 of 7 fields).
- **(c) agent-sdk runtime config — THE homeless nature.** ~13 isolation pins + an 11-key reserved-denylist
  + the 3-mode credential firewall (200+ lines, **security-load-bearing, rebuilt every turn**), today
  hardcoded literals in `providers/claude-sdk/env.ts`, called "env" only because it *emits* env vars.
  Target: **extract into a named backend-internal config of the claude-sdk strategy** — NOT a settings
  tier. (This is the credential firewall that must never leak the sub — handle with care.)
- **(d) generation params** — `UserIntent`/preset, translated per-backend. **CLAUDE.md claim verified
  TRUE:** reasoning is typed SDK Options, not env (`effort`/`thinking`); only `maxOutputTokens`/
  `maxContextTokens`/compaction ride env, and they're preset-sourced (env-*shaped* only at the wire).
- **Tangle to undo:** `claudeRuntimeEnv()` mixes (c)+(d) in one object; `OPENROUTER_API_KEY` wears 3 hats
  (secret/seed/live-client-read); `UserIntent.advanced.claudeEnv` is a preset (d) field reaching into (c),
  gated by a runtime denylist not a type. **Keep:** all 3 tiers share ONE `defineVersionedConfig`
  primitive; memory tuning is correctly split write-side (AppSettings) vs read-side (UserSettings).

### 7.3 serialization / serde core  *(recon complete — `spine/serialization-core.md` to be written)*
Recon **corrected the first read** — two of the "3 card shapes" are a *justified* emit/read pair, and the
PNG codec is *not* scattered. The real findings:
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

### 7.4 types & schemas — one home, one direction, no inline  *(NEW thread — `spine/types-and-schemas.md`)*
The problem: a shape's "home" is ambiguous — drizzle schema in `db`, re-declared/re-exported in `shared`,
each domain has its own `contract/`, and the client needs some shapes for client-side validation. So
shapes get duplicated and inline types/schemas sprout everywhere. The target rule (**one home per shape,
derived by who needs it; flows DOWN only**):

| Shape kind | Home | Consumers (down only) |
|---|---|---|
| **DB row** | `db` (drizzle table → inferred `$inferSelect`/`Insert`) | server persistence |
| **cross-boundary wire** (server↔client, or domain↔domain) | `contracts` (zod + inferred TS) | server, client, other domains |
| **domain-internal** | that domain's `contract/` (params/results/views/errors) | only that domain |
| **client-only view** | client | client |
| **pure primitive shape** | `kit` | anyone (it's the bottom) |

**The gate — `no-inline-types`:** no exported `type`/`interface`/`z.object` (and no structural cast)
declared OUTSIDE `db` schema / `contracts` / a domain's `contract/` / `kit`. Inline shapes in `verbs/`,
`persistence/`, `service.ts`, transport, or client components are RED. This is the enforced version of
"no schemas or types outside their proper places." Readers flag every leak (§6B `inlineTypes`); the
spine doc defines the exact gate.

### 7.5 string-union dispatch discipline  *(NEW thread — grounded by the AST dispatch scout)*
The coupling an import-graph CANNOT see: runtime branching on string-union "kind" keys. The scout
**quantified the "touch N spots to add one variant" pain** (`reports/dispatch-scout.json`):

| axis | touch-count | shape of the rot |
|---|---|---|
| `messageRole` (system/user/assistant) | **132** | 3 competing canonical const-arrays + 116 inline re-spellings; no importable union |
| `users.role` (admin/user) | 35 | no exported `UserRole` union → 33 inline `"admin"\|"user"` re-decls |
| `guidedAction` (6) | 23 | 14 redecls + 4 **untyped** `Record`s (no exhaustiveness backstop) |
| `routing.source` (4) | **18** | **the user's lived pain, MEASURED** — 11 inline re-decls of the source union (dispatch IS gated; the cost is pure re-declaration) |
| `routing.api` (3) | 12 | 9 inline re-decls (dispatch fully `assertNever`-gated) |

**The GOLD STANDARD to copy (already right):** `workloads.kind` dispatches through
`RUNNERS: { [K in WorkloadKind]: Runner<K> }` — a **mapped-type Record**, so a missing kind is a hard
`tsc` error. `routing.api`/`source` runner switches use typed-return / `assertNever`. **Target rule:**
every axis has (a) ONE importable canonical union/tuple (no inline re-spelling — gated), and (b) a
mapped-type Record or exhaustive `assertNever` dispatch (a new member fails the build). The leaky axes
(`messageRole` switches, `guidedAction` untyped Records, the `authMode`/`runner` if-chains) convert to
that shape. This is its own gate candidate: **`no-inline-union-redecl` + `exhaustive-dispatch`.**

---

## 8. Grounded intelligence (the AST + recon arming — read before the fanout)

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
agent principal is *both* userId-backed *and* AI-driven, which is **currently unrepresentable** (the XOR
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
un-verified assertion in `domains/connection.md`/`tiers/providers.md`/`participants-agents-identity.md`/
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
