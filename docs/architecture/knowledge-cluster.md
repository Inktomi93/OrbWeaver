# Orbweaver — the knowledge cluster: embeddings · memory · search · discovery

> **Status: planning (authoritative detail).** The full design for the embedding substrate and its
> readers. `domains.md` carries the one-line summary; THIS doc is the source of truth for the cluster.
> Grounded in: the neo-tavern `memory-diagram.pdf` (original *intent*), neo's shipped `chat/memory`
> implementation + its **real-ST-chat-import tuning** (the numbers — more grounded than the diagram), a
> full read of SillyTavern's **Summarize** (rolling abstractive summary) + **Vector Storage** (extractive
> verbatim retrieval) extensions — orbweaver memory is a **combo of the two + extra** — and the
> `unified-group-chat.md` §11.5 group-as-character memory model. The memory-design ratification pass
> (2026-06-29, with Nate) settled the numbers, the bridge-as-pool retrieval, the `text` storage, the
> unified `CharacterId` keying, the two guards, host-only execution, trigger discipline + observability,
> the in-full scoped/witnessing/membership build, and the mode-switch handling.

## 0. The spine: build once, read many

There is **one substrate of embedded content, built once, stored once**, and **many read-only
consumers**. Nothing re-embeds or re-stores for its own use.

```
                         ┌──────────────── embeddings (the store) ────────────────┐
   canon writes ──emit──▶│ ONE vector store · ONE write path · ONE 1024-dim space  │
   (chat turn / import /  │ source kinds: chat SEGMENT · chat DIGEST · character    │
    character save /      │ CARD · avatar IMAGE. content_hash + hub_score columns.  │
    avatar upload)        └───────────┬────────────────────────────────────────────┘
                                      │ read-only
        ┌─────────────────────────────┼──────────────────────────────┐
        ▼                            ▼                               ▼
     search                       memory                         discovery
   the retrieval ENGINE       the BUILDER + chat-scoped         library SEMANTICS
   (scope × lens × rerank)    RECALL policy (calls search)      (themes/hubness/dup/
   over the whole store       → fills {{memory}}                 distill) + hub_score
```

**Two hard invariants (everything else follows):**
1. **The substrate is a pure function of canon.** It is a derived index, never a second source of
   truth. Any row can be deleted and rebuilt from `messages` alone. This is what keeps the
   "enabled-later" roadmap (§9) free, makes edits/forks safe, AND makes mode-switching loss-free (§4).
2. **Build never blocks the reply.** Substrate construction runs *after* a turn commits
   (fire-and-forget) or in bulk backfill — never on the send hot path.

---

## 1. `embeddings` — the store (a shared mechanism, not a row-owner-by-feature)

Owns the **one vector store, the single write path, and the one embedding space**. Producers write
THROUGH it; it is the only code that inserts a vector.

- **Space is a tagged variable (NOT a single pin) — tied to the MODEL, not the backend.** The embed
  *model* defines the space `(model, dim)`. Every vector is tagged with it; `search`/`memory` compare
  **only within one space**. **Same model on different backends = same space = FREE switch** (Qwen-1024
  on vLLM or OpenRouter — flip local↔hosted, no re-index). **A different model/dim is its own space →
  dump + re-index workload** — a rare, deliberate, set-and-leave change, never a per-turn knob.
  Text↔image cosine works only inside a joint multimodal space (Qwen, vLLM *or* OpenRouter); a CPU CLIP
  image embed is its own space. (Full detail: `tiers/providers.md` §2b.)
- **The single write API:** `embeddings.store(kind, lens, key, content, model, …)` → embeds + upserts.
  Kills the 6 hand-rolled write sites recon found. A source `kind` carries **multiple lenses** + the
  per-lens facets the lens needs (so `search`/`memory` can read them without a second table):
  - `chat-block` → **`segment`** (the verbatim `text` + seq-span) · **`digest`** (the distilled `text` +
    `topicAnchor` + `keywords` + `tier`, the §2 facets)
  - `avatar` → **`image-raw`** (pure image, NO caption) · **`image-captioned`** (image **+** description)
  - `card` → **`card-text`** (one lens)

  All lenses live in the **one 1024-dim space** (cosine-comparable); the *lens you search* controls
  whether text influences the result.
- **Staleness + collapse key — `content_hash`** (one column, two jobs, both verified necessary):
  - *Staleness:* re-derive a row iff its `content_hash` changed. It folds the seq-span content **and the
    stable speaker `characterId` and the scope** (§4) — so a re-attribution or a mode-switch correctly
    invalidates, and same-words/different-speaker blocks don't falsely collapse. Name-INDEPENDENT
    (renames/persona switches don't bust it; genuine re-attribution does).
  - *Cross-chat collapse:* fork/import copies with identical content collapse to one hit in search +
    one rep in all-pairs analytics (so a forked scene counts once).
- **`hub_score` column** — a *search ranking* signal **computed by `discovery`** (CSLS), stored here,
  read by `search`. **A vector write must NOT null it** (the neo-tavern reset-in-3-places bug). Advisory-
  stale by design; discovery recomputes it on its own cadence.
- **Rows stay FK'd to their producer** (a digest row → `chats`, cascade-safe). NO `ownerId` on the
  digest/segment rows — owner DERIVES via the chat FK (D20). NO `characterVersionId` (D28 de-pin) — so
  orbweaver never faces neo's feared `NOT NULL cv` full-table rebuild; the speaker identity lives in
  `scopedCharacterId` (§4) + `chat_digest_speakers`, not a cv stamp.

---

## 2. The substrate shape — two lenses per block

Every chat is sliced into fixed **`blockSize`-message blocks**. Each *completed, aged-out* block is
captured through **two complementary lenses**, both embedded, both pointing back to the same
`(chatId, blockIdx, seq-span)`. **Both lenses store their `text`** (the verbatim transcript / the
distilled digest) — the diagram and ST both store it, and the cross-chat read returns text directly
rather than re-reading N chats' canon per hit.

### 2a. SEGMENT — the verbatim lens
The raw transcript of the block, **stored (`text`) + embedded**. The ground truth a digest hit resolves
back to. Keyed `(chatId, blockIdx)`. Every complete block, all chats.

### 2b. DIGEST — the distilled lens (structured, NOT prose)
A retrieval-optimized unit produced under a strict prompt with **three mandatory parts**, all folded
into the stored `text` (and the anchor + keywords also kept as separate retrieval facets):
1. **Topic anchor** — mandatory first line, `[entities — scene]`.
2. **Significance-filtered facts** — litmus: *"will this matter later?"* (drop turn-by-turn noise).
3. **15–30 concrete keywords** — distinctive retrieval anchors (named entities, specifics).

Keyed `(chatId, scopedCharacterId, tier, blockIdx)` (the scope key — §4; `scopedCharacterId` is a real
`CharacterId`, never a sentinel). Embedded. The *sharp* search key (a raw block embeds noisily —
everything looks like "two people talking"; the distilled anchor+facts+keywords retrieve cleanly). The
stored `text` is **what fills `{{memory}}`** AND what is embedded.

> **Why both, not either:** ST embeds verbatim XOR a lossy summary (its Vector Storage vs Summarize
> extensions are two separate systems). We keep both, permanently linked — digest = the sharp key + the
> distilled readable text injected into `{{memory}}`; segment = the verbatim text it resolves to.

---

## 3. `memory` — the builder + the chat-scoped recall

`memory` is a **`chat/` subsystem** (LOCKED — `structure.md §4` + `domains/chat.md`). Substrate-mediated:
only `chat/context.ts` reaches into it. The *shared* substrate (the vector tables) is owned by
**`embeddings`**; the *retrieval mechanism* is `search`'s. Memory owns exactly two things: digest
GENERATION and the `{{memory}}` recall POLICY.

**Host-only execution (invariant).** Both the build and the recall run under the turn's **`runAsUserId`
(the host)** — never the triggering member (`triggeredBy`). One memory per chat, host-owned (D16 host-
only-corpus; owner derives via the chat FK, D20). A member never builds or owns a parallel memory — but
a member-triggered turn (which runs *as* the host) still **gets** the recall, because `{{memory}}` lands
in the shared prompt. "Only the host runs it" + "everyone benefits from it" are both true. A gate keys
memory ops off `runAsUserId`, never the member.

### 3a. The build (the SillyTavern-summarizer replacement)
- Triggered **post-turn** (fire-and-forget, never blocks the reply) and by **import backfill** — same
  functions, same result.
- **Two guards (do not conflate them):**
  - *Build-protect* (`verbatimWindow`, a small **fixed** message count): `cutoff = maxSeq −
    verbatimWindow` — only blocks fully **aged out of the live tip** are digested. Small-on-purpose so a
    block is digested aggressively and there is **never a gap** (aged-out-but-undigested-and-out-of-
    window → forgotten). It is ST's `protect` zone, NOT a context-budget knob.
  - *Recall window-filter* (token-driven — §3b): at recall, skip digests whose seq-span is still inside
    **this turn's** live history window, so `{{memory}}` never re-injects a scene already verbatim in the
    prompt. Token-window-driven (steal ST's recent-guard, but token- not message-count-based).
- **Trigger discipline (no spurious early runs — observability invariant).** A **fresh chat does ZERO
  memory/embed work** until the first block ages out:
  - The build does a **cheap pre-check** — "is there a new complete aged-out block since the last build?"
    (compare newest-digestable `blockIdx` to the max existing digest `blockIdx`) — and **skips entirely**
    (no load, no hash, no summarize, no embed) when there isn't. The self-heal/`content_hash` path only
    re-checks blocks an aged-out edit/reorg could have changed.
  - The recall (§3b) **early-returns before embedding** when `mode==off` or the digest pool is empty — so
    the per-turn query embed never fires on a chat with no digests.
  - Testable invariants: *"recall does not embed on an empty pool"* and *"build issues no summarizer call
    when no block has aged out."*
- **Embeds via `embeddings.store`** — memory never inserts a vector itself.
- **Self-heals (hash-diff):** a block is re-digested *only if* missing or stale (`content_hash` changed —
  seq-span changed, a message edited, a re-attribution, **or a scope/mode change**, §4). Swipes/edits at
  the live tip never touch settled digests (the protect zone shields them). A fork **lazily rebuilds only
  what diverged**, reusing the parent's digest `text` for identical-`content_hash` blocks (skip the
  summarizer call).
- **Summarizer = a `chat`-turn on the user's own backend** (NOT a separate model; `tiers/providers.md`
  §2b). It runs at whatever context the user's summarizer has (default ~32k, but could be a tiny local
  main OR a hosted 200k). **The summarizer call is token-guarded** against that actual context — a giant
  pasted message or a small-context main must NOT silently truncate the block tail; degrade gracefully
  (split / trim-oldest-within-block / skip-and-flag). `blockSize` is small enough (~3k tok) to fit any
  reasonable summarizer, but the guard is the real safety, not the count.
- **Tiering** keeps "the story so far" token-bounded (§5).
- **Observability — a `memoryTrace` (chat is not a black box).** Per turn, alongside the assemble trace:
  `{recall:{mode,poolSize,surfaced,queryEmbedded,ms}, build:{blocksBuilt,blocksSkipped,blocksReused,
  summarizeCalls,embedCalls,ms}}`, plus structured log points at both boundaries
  (`memory.recall … skipped (no digests)` / `memory.build … skipped (no aged-out block …)` /
  `memory.build … digested tier0 blockIdx=N (…tok, …ms)`). "Did memory do work this turn, and why" is a
  first-class, logged, greppable fact.

### 3b. The recall policy (fills `{{memory}}`)
- `memory.recall(chatId, speaker, …)` = read this chat's digests for the speaker's scope + assemble into
  the **single `{{memory}}` macro**.
- `{{memory}}` lands in the **dynamic (cache-safe) half** of the system prompt, *after* the cache
  boundary — so the per-turn memory set never busts the cached static prefix.
- **The pool is the BRIDGE, not flat tier-0.** The §5 tiered bridge (coarse high-tier for the distant
  past + fine tier-0 for the recent past — the uncovered-digests-only set) is the candidate pool for
  **every** retrieval mode, so a distant-past query surfaces that span's **arc-level** digest rather than
  a granular scene, and the pool stays bounded as the chat grows.
- **Modes** (`mode`, default **`mixC`**): `off` · `mixA` (the whole bridge, chronological — pure
  assembly, no embed) · `mixB` (embed the recent-window query → exact in-process cosine + keyword-match
  over the bridge → top `retrieveK`) · `mixC` (mixB **+ cross-encoder rerank** → `rerankTo`) · `tiered`
  (the bridge chronological — same pool, no query filter). The default `mixC` gives query-relevance + the
  bounded multi-tier pool + a generous `retrieveK` (degrading toward "the whole bounded story, relevance-
  ranked"). Always presented chronologically by seq-span.
- **Mode-switch & scope are handled by the recall, not a re-digest (§4).** The recall reads **the shared
  bucket ∪ the speaking character's own per-character bucket, witnessing-filtered** — one path that spans
  always-merged, always-scoped, and any toggle sequence.
- The *read mechanism* is search's; memory owns the **scope + window + mode + assembly** policy.

---

## 4. Group scoping — one `CharacterId` key, egocentric `scoped` recall, mode-switch-safe

The unified single-system design (solo and group are the SAME path — D16, `no-if(isGroup)`). The digest
scope key **`scopedCharacterId` is ALWAYS a real `CharacterId`** (FK → `characters`; never the `''`
sentinel, never NULL) — "whose memory is this":

| Room kind | `scopedCharacterId` (the bucket) | Recall (what the speaker gets) |
|---|---|---|
| **solo** (roster-of-1) | the single cast character's id — the room *is* that character | that character's bucket |
| **merged / narrator** | the **synthetic group-as-character** (`__group__${chatId}`, a real hidden id) | the shared room bucket |
| **scoped** | **each cast character's id** (per-character egocentric) | the active speaker's own witnessed bucket |

There is **no special-case empty-string sentinel** — solo flows through the exact same keying as a group,
just with one character. **`narrator` (an output mode) ≠ the synthetic group character (the identity):**
the synthetic character is what the merged/narrator bucket is keyed to AND what *authors* narrator
messages (`messages.characterId` = the group char, a real id, never NULL); narrator is one of the output
modes that *reads* that shared bucket. orbweaver is a step ahead of neo here — neo *stamped* the group
character's cv to dodge a `NOT NULL cv` rebuild; orbweaver dropped the cv entirely (D28), so the real id
lives directly in the key.

**Built IN FULL (not deferred — orbweaver does the comprehensive thing neo phased):**
- **`scoped` per-character memory** is fully built, not an opt-in afterthought. Each character has its own
  egocentric bucket; recall reads only the active speaker's.
- **The present-at-seq WITNESSING predicate** — a character's scoped bucket contains only blocks it was
  actually present for, computed from the **`joinSeq`/`leftSeq` horizons** on `chat_participants` (NOT
  `messages.excludedFromPrompt`, a single global boolean that cannot express per-character witnessing). A
  character genuinely cannot recall a scene it wasn't in — including across kick/re-add intervals.
- **`chat_digest_speakers`** ("which characters a block *contains*") backs by-character search across
  rooms regardless of the egocentric bucketing ("search my memories of Alice" finds her lines inside
  group rooms). The **`isGroup`/`roomKind` tag** partitions CSLS/themes analytics so group rows don't
  blend into the host's per-owner analytics. The synthetic group char is **hidden / no card embedding**
  (never pollutes character similarity).

**Mode-switch within a chat (merged ↔ scoped ↔ narrator) — the scope is part of the digest IDENTITY, not
a global setting; no eager re-digest, no loss:**
- **narrator ↔ merged is a memory no-op** — both write+read the same shared (group-as-character) bucket;
  only generation differs.
- The real transition is **shared (merged/narrator) ↔ scoped.** Each block is digested under whatever
  scope was active *when it aged out* (folded into `content_hash`); a merged/narrator-era block → the
  shared bucket, a scoped-era block → per-character buckets (witnessing-gated). **Recall reads the shared
  bucket ∪ the speaker's own per-character bucket, witnessing-filtered** — so merged-era blocks are
  recalled by everyone, scoped-era blocks only by the witnessing character. One rule covers always-
  merged, always-scoped, and any toggle sequence: **no `if(currentMode)` branch, no eager re-digest, and
  a character never loses memory of a scene it witnessed.** (An *always*-scoped chat has no shared
  digests, so recall is egocentric-only — inv 6 holds; only a genuinely *switched* chat reads both,
  because the merged era genuinely *was* shared.)
- **Default = keep-each-era's-scope-as-built** (loss-free, semantically honest — flipping to merged does
  NOT retroactively make the cast omniscient about a previously-private scoped era). A "rebuild the scoped
  era as one shared memory from canon" is a **reserved explicit host action** (possible because the
  substrate is a pure function of canon), never automatic.

The default room is **per-speaker × `merged`** (the group-chat plan §11.2), so default rooms ride the
shared bucket; the per-character machinery engages under `scoped` — but it is fully built, not phased.

---

## 5. Tiering — bounded "story so far"

Injecting every tier-0 digest would blow the budget on a long chat. Blocks **consolidate upward**
(`fanOut`): every `fanOut` tier-k digests merge into one tier-(k+1) digest under a delta prompt ("here
are prior consolidations — do NOT repeat them"). A higher-tier anchor is a genuine cross-block synthesis,
not a concatenation (and its `text` is stored + recalled like any digest, §2b). `maxTier` caps depth. The
recall **bridge** (the pool for every mode, §3b) = the uncovered-digests-only set: coarse high-tier for
the distant past + fine tier-0 for the recent past → the injected "story so far" stays roughly constant
no matter how long the chat runs.

**The numbers are grounded DEFAULTS, the *principle* is the invariant.** neo tuned these against **real
imported ST chats** (more grounded than the diagram's theoretical `16/30/8`, which never filled tiers at
real chat lengths — `fanOut 8 × blockSize 16` needs 128 messages for tier-1, 1024 for tier-2). The
grounded defaults: **`blockSize 8` · `fanOut 4` · `verbatimWindow 8` · `maxTier 3`** — tier-1 fills at 32
messages, tier-2 at 128, tier-3 at 512, so tiering actually engages at typical lengths. They stay
**tunable knobs** (§10, decide-during-build); the real invariants are: *the summarizer block fits the
smallest realistic summarizer context* (token-guarded, §3a — `blockSize 8 ≈ 3k tok` fits a tiny local
main, 32k, or hosted 200k; bigger would footgun small-main users) and *tiers consolidate at typical chat
length*.

---

## 6. `search` — the one retrieval engine

Read-only over the whole store. **One engine, parameterized:**

- **scope** — one chat · a character · **all the user's chats**
- **lens** — chat: raw **segment** (verbatim) · **semantic** digest · a **tier**; avatar: **image-raw** ·
  **image-captioned**; card: **card-text**. *The lens controls text-influence on the result.*
- **rerank / top-k / `minScore` threshold / hub-adjust**

Two access patterns over the same store (ANN dropped at this corpus scale — exact scan):
- **within-chat** (memory's caller): exact cosine over **this chat's BRIDGE** (the §5 multi-tier
  uncovered set — NOT flat tier-0; the diagram's "tier-0 only" was the pre-bridge model), scoped to the
  speaker's bucket(s) per §4. Small, fast, query carries `queryText` + the egocentric `scopedCharacterId`.
- **cross-chat** ("where across all my chats did X happen?"): scan all digests+segments → **CSLS hub
  adjust** (`dist − 1 + hub_score`) → **joint cross-encoder rerank** (digests + segments in ONE list) →
  **dedupe per block** (digest+segment → the better lens) → ranked hits → **seq-span back to canon.**

**Cross-chat is MEMBERSHIP-GATED in full (not "host-only v1").** A user's owner-wide search is membership-
correct: a member can search the rooms they participated in (their **witnessed** content, backed by the
join/leave horizon + `chat_digest_speakers`); a host's search does not silently surface a co-participant's
words from a shared room outside that membership-gated union. The privacy model is the full multi-human
one, built now — not deferred.

`search` also owns the **lexical engine** — a MiniSearch/BM25 index over card fields, the complement to
vector retrieval. Two engines (vector + lexical) under one `search` domain; callers pick.

---

## 7. `discovery` — library semantics (+ computes `hub_score`)

Read-only over the store; **embeds nothing itself**. Owns:
- **themes** — k-means clusters over digest embeddings → `theme_clusters` + assignments (partitioned by
  the `isGroup`/`roomKind` tag so group rows don't blend in).
- **hubness** — CSLS `hub_score` per (entity, model). Written to the embeddings rows via the embeddings
  write helper; read by `search` ranking. (The seam: discovery computes, embeddings stores, search reads,
  vector-write never nulls.)
- **near-duplicates**, **distillation** (genre/tone/pitch → `character_summaries`), **archetypes**,
  **similarity browsing**.

`discovery` is **semantics**; `stats` is **economics** (tokens/cost/cache/timing — zero vector tables).
The line is **type-enforced**: discovery never computes a usage rollup.

---

## 8. Ownership & boundaries (summary)

| Concern | Owner |
|---|---|
| vector store, single write path, one space, `content_hash`, `hub_score` column | **embeddings** |
| substrate build (summarizer: block→segment+digest+tier; group-aware; self-heal; fork-lazy; host-only) | **memory** |
| `{{memory}}` recall policy (scope=chat, window, mode, bridge-pool, assembly, mode-switch) | **memory** (calls search) |
| the retrieval engine (vector: scope×lens×rerank; membership-gated cross-chat; + lexical BM25) | **search** |
| themes/hubness/dup/distill + computes `hub_score` | **discovery** |
| turn economics | **stats** (separate; zero vector tables) |

Every cross-domain access goes through a real boundary (`embeddings.store` / `search` / `memory.recall`)
— never one domain reaching into another's tables.

---

## 9. Substrate-ready roadmap (reserve the CONTRACT seams now, build the behavior later)

Possible *only because* the substrate is a pure function of canon (§0). These are **net-new feature
surfaces** (new verbs / client UI / a reconciler workload / an observer agent) — a later feature wave, NOT
core-memory deferrals. The **born-compliant CONTRACT SEAMS land now** (typed, zero behavior) so each is a
clean additive graft, never a schema fight, and easy to hook up + design down the road:
- **Trackers** — a single entry that updates in place (relationship status / inventory / plot threads).
- **Clips** — user-pinned one-off facts.
- **User-curated long-term promotion** — hand-pick what persists.
- **`{{world_state}}` + a `reconcile-world-state` `WorkloadKind`.**
- **The Narrative Director** — a per-chat `'observer'` agent.

> **Seam reservation (council 2026-06-25 — reserve now, build v2).** Type the unions NOW even with zero
> behavior: `ClipKind ∈ 'fact'|'trait'|'relationship'|'world-state'|'plot-thread'`,
> `ClipSourceKind ∈ 'user'|'synthesized'|'promoted'` (never auto-delete a `'user'` clip),
> `clip.scope ∈ 'character'|'chat'|'global'` — all in `@orb/contracts/memory`. A `{{world_state}}` macro
> reserves the same dynamic/cache-safe slot as `{{memory}}`; the `reconcile-world-state` `WorkloadKind` is
> reserved in `domains/workloads.md`. (Nate 2026-06-29: "carve out contract and make it easy to hook them
> up and design them down the road.")

---

## 10. Knobs (per-preset where user-facing — grounded defaults, decide-during-build)

`blockSize` (**8**) · `verbatimWindow` (**8**, build-protect) · `mode` (off/mixA/mixB/mixC/**tiered**;
default **mixC**) · `fanOut` (**4**) · `maxTier` (**3**) · `retrieveK` · `rerankTo` · `minScore` ·
`keywordMatch` · `recencyBias` · `summarizer` (NOT a separate model — a `chat`-turn on the user's backend,
token-guarded; `maxTokens`, `temperature`).

---

## 11. Invariants (the things a gate should protect)

1. Substrate is a **pure function of canon** — never a second source of truth.
2. Build **never blocks the reply** (post-commit / backfill only).
3. **One embedding space** (one model/dim); **one write path** (`embeddings.store`).
4. **One retrieval engine** (`search`) — memory + discovery call it, never reimplement cosine. Memory
   holds **zero cosine + zero vector-write**.
5. `hub_score` is **never nulled by a vector write**.
6. **Scoped recall is egocentric-only** (within a scoped era): the active speaker's own witnessed bucket;
   a switched chat additionally reads the shared bucket for its merged/narrator eras (§4).
7. `discovery` (semantics) and `stats` (economics) **share no tables**; discovery computes no usage
   rollup.
8. **`scopedCharacterId` is always a real `CharacterId`** (no `''` sentinel, no NULL); solo / merged-
   narrator / scoped all key uniformly (§4).
9. **Memory build + recall run under `runAsUserId` (host-only)**, never `triggeredBy` / the member.
10. **Trigger discipline:** recall does not embed on an empty pool; build issues no summarizer call when
    no block has aged out — a fresh chat does zero memory/embed work.
11. **The scope/speaker is folded into `content_hash`** — a mode-switch or re-attribution invalidates the
    affected digests; mode-switching is recall-handled (shared ∪ own-witnessed), never an eager re-digest.
12. **The witnessing predicate is the join/leave horizon** (`joinSeq`/`leftSeq`), never the global
    `excludedFromPrompt` boolean.
