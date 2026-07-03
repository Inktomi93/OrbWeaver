---
kind: history
status: superseded
supersedes: docs/architecture/core/AGENTS-1-Architecture.md §4
updated: 2026-07-03
---

# The Pain Ledger — the neo-tavern crunches the remake resolved

> Extracted 2026-07-03 from `core/AGENTS-1-Architecture.md` §4 (cited elsewhere as "AGENTS-1 §4" /
> "the Pain Ledger"). These are the per-domain neo-tavern crunches the remake was chartered to resolve.
> The domains are BUILT — each "Target" below is now carried by the orbweaver code + its file headers,
> so this inventory is archeology, not live law. Line counts and file:line claims describe the
> neo-tavern steady clone, not this repo.

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
  (Authoritative for the exact counts + mechanics: `packages/server/src/domain/chat/` — this bullet
  orients; it does not carry the numbers.)
- **connection / models** (`models` is 242 lines, folds in): connection **fragmented** across
  user-settings / chat-row / preset; **two capability systems** (`ChatModel` + `FAMILY_CAPS`,
  incompatible shapes, cross-merged); **reasoning collapsed into one cascade** (`effort:"none"` doubles
  as the off-switch; translated twice); `routing.ts` keyed on **`runner`** (infra-internal vocab leak);
  scattered `derive*Profile` dispatchers (three, not four); the params panel has only **coarse
  source-level knob gating** (a build-on point, not capability-driven); roles **hard-pinned in the
  binder** instead of reading settings. Target: ONE capability descriptor (distinct reasoning/sampling/
  verbosity axes) drives translation AND panel; `resolveRole`. (Authoritative: `domain/connection`.)
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
  computes hub\_score on embeddings rows.
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
  per-chat, attribution per-message; drop `chats.personaId`. (Authoritative: `core/Spine-Identity-and-Auth.md`.)
- **character** (1795 lines): the **cv-pin** is woven through (`chats.characterVersionId` notNull);
  `cow.ts` CAS dance **exists only because chats pin**; `character_books` keyed on **cv** while
  `character_personas` keys on `characters.id` (deliberate book-snapshot semantics in neo — superseded
  by D28: no version table, so both key on `characters.id`). Target (**D28**): NO version table at all —
  the card is the flat `characters` row (read via `getCard`); `cow.ts` deleted; history = the
  `character_snapshots` log (browse/`restore`, gates nothing); all associations key on `characters.id`.
- **tag** (693 lines): **proposed = a parallel store** (JSON column) instead of a junction status —
  `proposedTags` is WIRED (import/seed/create/update write it, export reads it), just the wrong SHAPE;
  accepted `character_tags` don't round-trip to export; analytics facets conflated with labels. Target:
  one namespace + junctions; proposed = status; facets are `discovery`.
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
  feature-internal — per Core-Laws-and-Precedents.md §7 D10), `content-hash` (→ `@orb/server/kit`, node-only-pure,
  NOT `@orb/kit` — per Core-Laws-and-Precedents.md §7 D9),
  `rate-limit.ts` (→ `transport`). **No `_shared` exists in orbweaver** — every file must land somewhere.
  (The full per-file dissolution record: `core/Core-Shared-Dissolution.md`.)
