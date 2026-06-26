# Orbweaver — the knowledge cluster: embeddings · memory · search · discovery

> **Status: planning (authoritative detail).** The full design for the embedding substrate and its
> readers. `domains.md` carries the one-line summary; THIS doc is the source of truth for the cluster.
> Grounded in: the neo-tavern `memory-diagram.pdf` (original intent), whole-file recon of the current
> corpus/search/memory/stats code, and a reference read of SillyTavern's memory + vectors extensions
> (the thing this replaces).

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
   "enabled-later" roadmap (§9) free and makes edits/forks safe.
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
- **The single write API:** `embeddings.store(kind, lens, key, content, model)` → embeds + upserts. Kills
  the 6 hand-rolled write sites recon found. A source `kind` can carry **multiple lenses** — what was
  embedded, so `search` can target text-influence:
  - `chat-block` → **`segment`** (verbatim text) · **`digest`** (distilled text, tiered)
  - `avatar` → **`image-raw`** (pure image, NO caption — for image↔image visual similarity, zero text
    influence) · **`image-captioned`** (image **+** description, joint Qwen3-VL vision+text)
  - `card` → **`card-text`** (one lens)

  All lenses live in the **one 1024-dim space** (cosine-comparable); the *lens you search* controls
  whether text influences the result (e.g. avatar dedupe/look-alike → `image-raw`; "find a brooding
  knight" → `image-captioned`).
- **Staleness + collapse key — `content_hash`** (one column, two jobs, both verified necessary):
  - *Staleness:* re-derive a row iff its `content_hash` changed. Name-INDEPENDENT (renames/persona
    switches don't bust it; genuine re-attribution does).
  - *Cross-chat collapse:* fork/import copies with identical content collapse to one hit in search +
    one rep in all-pairs analytics (so a forked scene counts once).
- **`hub_score` column** — a *search ranking* signal **computed by `discovery`** (CSLS), stored here,
  read by `search`. **A vector write must NOT null it** (the neo-tavern reset-in-3-places bug). It is
  advisory-stale by design; discovery recomputes it on its own cadence.
- **Rows stay FK'd to their producer** (a digest row → `chats`, cascade-safe). "embeddings owns the
  store" = owns the table + write path + space; the *content* is produced by memory/character/assets.

---

## 2. The substrate shape — two lenses per block

Every chat is sliced into fixed **16-message blocks** (`blockSize`). Each *completed, aged-out* block is
captured through **two complementary lenses**, both embedded, both pointing back to the same
`(chatId, blockIdx, seq-span)`:

### 2a. SEGMENT — the verbatim lens
The raw transcript of the block, embedded. The ground truth a digest hit points back to. Keyed
`(chatId, blockIdx)`. Every complete block, all chats.

### 2b. DIGEST — the distilled lens (structured, NOT prose)
A retrieval-optimized unit produced under a strict prompt with **three mandatory parts**:
1. **Topic anchor** — mandatory first line, `[entities — scene]`.
2. **Significance-filtered facts** — litmus: *"will this matter later?"* (drop turn-by-turn noise).
3. **15–30 concrete keywords** — distinctive retrieval anchors (named entities, specifics).

Keyed `(chatId, scopedCharacterId, tier, blockIdx)` (the scope key — §4). Embedded. The *sharp* search
key (a raw 16-msg chunk embeds noisily — everything looks like "two people talking"; the distilled
anchor+keywords retrieve cleanly).

> **Why both, not either:** ST embeds verbatim XOR a lossy summary. We keep both, permanently linked —
> digest = the sharp key, segment = the verbatim text it resolves to.

---

## 3. `memory` — the builder + the chat-scoped recall

`memory` is a **`chat/` subsystem** (LOCKED — `structure.md §4` + `domains/chat.md`; an earlier draft
called it "its own domain," which was stale). It is substrate-mediated: only `chat/context.ts` reaches
into it. The *shared* substrate (the vector tables) is owned by **`embeddings`**, not memory — so memory
being read by others is not a reason to promote it to a domain. Memory owns exactly two things; the
*retrieval mechanism* is `search`'s.

### 3a. The build (the SillyTavern-summarizer replacement)
- Triggered **post-turn** (fire-and-forget, never blocks the reply) and by **import backfill** — same
  functions, same result. Wired cross-domain via the composition root (chat/import call
  `memory.build(chatId)`).
- **`cutoff = maxSeq − verbatimWindow(30)`** — only blocks that have **aged out of the live tip** are
  digested. The most-recent 30 messages are the protect zone: they're still in the model's window, so
  digesting them is wasted + they must stay editable. Segments are built for every complete block.
- **Embeds via `embeddings.store`** — memory never inserts a vector itself.
- **Tiering** keeps "the story so far" token-bounded (§5).
- **Self-heals (hash-diff, stolen from ST):** a block is re-digested *only if* missing or stale
  (`content_hash` changed — i.e. seq-span changed or a message was edited after the digest was written).
  Swipes/edits at the live tip never touch settled digests (the 30-msg window protects them). A fork
  lazily rebuilds only what diverged.

### 3b. The recall policy (fills `{{memory}}`)
- `memory.recall(chatId)` = `search(scope = this chat, lens = digests, window = aged-out)` +
  assembly into the **single `{{memory}}` macro**.
- `{{memory}}` lands in the **dynamic (cache-safe) half** of the system prompt, *after* the cache
  boundary — so the per-turn memory set never busts the cached static prefix.
- **Modes** (`mode`): `off` · `mixA` (all this chat's tier-0 digests, chronological) · `mixB`
  (+vector retrieve) · `mixC` (+cross-encoder rerank) · `tiered` (the bridge: coarse high-tier digests
  for the distant past + fine tier-0 for the recent past → constant token budget regardless of chat
  length).
- The *read mechanism* is search's; memory owns only the **scope + window + lens + assembly** policy.

---

## 4. Group scoping — one scope key, egocentric `scoped` recall

The one twist groups add (the group-chat plan §11.5, made native here, not bolted on). The digest scope
key `scopedCharacterId` selects which "pile" a digest belongs to:

| Room kind | Build (which pile) | Recall (what the speaker gets) |
|---|---|---|
| **solo · merged · narrator** | ONE **shared** bucket per chat (`scopedCharacterId` = the room / group-as-character) | the shared bucket — "this chat's memories" |
| **scoped group** | **per-character egocentric** buckets (`scopedCharacterId` = each character; witnessing predicate = present-at-seq from join/leave) | **EGOCENTRIC-ONLY (decided):** only the active speaker's own witnessed bucket. A character cannot recall a scene it wasn't in. |

**Decision (locked):** scoped recall is **egocentric-only** — *not* egocentric + shared. Rationale:
`scoped` exists precisely to give per-character isolation; mixing the shared pile back in defeats its
purpose, and `merged` already serves "everyone shares one memory." Keeps the rule dead simple: *recall
reads the bucket(s) keyed to the active speaker; merged/solo reads the one shared bucket.*

**Cross-cutting:** a `chat_digest_speakers` join ("which characters this block *contains*") lets
`search`/`discovery` find a character's moments **across rooms regardless of bucket** — so by-character
search isn't limited by the egocentric bucketing.

---

## 5. Tiering — bounded "story so far"

Injecting every tier-0 digest would blow the budget on a long chat. Blocks **consolidate upward**
(`fanOut = 8`): every 8 tier-k digests merge into one tier-(k+1) digest, under a delta prompt ("here are
prior consolidations — do NOT repeat them"). Tier-1 = 8 blocks (a coarse arc); tier-2 = 8 tier-1s
(`maxTier` caps depth). A tier-1 anchor is a genuine cross-block synthesis, not a concatenation. The
`tiered` recall mode consumes a **bridge**: coarse high-tier for the distant past + fine tier-0 for the
recent past → the injected "story so far" stays roughly constant no matter how long the chat runs.

---

## 6. `search` — the one retrieval engine

Read-only over the whole store. **One engine, parameterized:**

- **scope** — one chat · a character · **all the user's chats**
- **lens** — chat: raw **segment** (verbatim) · **semantic** digest · a **tier**; avatar:
  **image-raw** (pure visual, text-free — image↔image similarity) · **image-captioned** (joint
  vision+text); card: **card-text**. *The lens controls text-influence on the result.*
- **rerank / top-k / `minScore` threshold / hub-adjust**

Two access patterns over the same store (ANN was dropped at this corpus scale — exact scan):
- **within-chat** (memory's caller): exact cosine over *this chat's* tier-0 digests. Small, fast.
- **cross-chat** ("where across all my chats did X happen?"): scan all digests+segments → **CSLS hub
  adjust** (`dist − 1 + hub_score`, penalizes generic "hub" vectors close to everything) → **joint
  cross-encoder rerank** (digests + segments in ONE list) → **dedupe per block** (digest+segment → the
  better lens) → ranked hits → **seq-span back to canon**.

`search` also owns the **lexical engine** — a MiniSearch/BM25 index over card fields (`field-search`),
the complement to vector retrieval. Two engines (vector + lexical) under one `search` domain; callers
pick. **Steal from ST:** the recent-window retrieval guard ("don't surface what's still in context") —
but make it **token-window-driven**, not ST's fixed message count.

---

## 7. `discovery` — library semantics (+ computes `hub_score`)

Read-only over the store; **embeds nothing itself**. Owns:
- **themes** — k-means clusters over digest embeddings → `theme_clusters` + assignments.
- **hubness** — CSLS `hub_score` per (entity, model). Written to the embeddings rows via the embeddings
  write helper; read by `search` ranking. (The seam: discovery computes, embeddings stores, search
  reads, vector-write never nulls.)
- **near-duplicates**, **distillation** (genre/tone/pitch facets → `character_summaries`),
  **archetypes**, **similarity browsing**.

`discovery` is **semantics**; `stats` is **economics** (tokens/cost/cache/timing — zero vector tables).
The line must be **type-enforced**: discovery never computes a usage rollup (neo-tavern enforced this
only by prose + a 2026-06-16 deletion; the residual gray zone was `insights.ts` reading raw `messages`).

---

## 8. Ownership & boundaries (summary)

| Concern | Owner |
|---|---|
| vector store, single write path, one space, `content_hash`, `hub_score` column | **embeddings** |
| substrate build (summarizer: block→segment+digest+tier; group-aware; self-heal; fork-lazy) | **memory** |
| `{{memory}}` recall policy (scope=chat, window, lens, mode, assembly) | **memory** (calls search) |
| the retrieval engine (vector: scope×lens×rerank; + lexical BM25) | **search** |
| themes/hubness/dup/distill + computes `hub_score` | **discovery** |
| turn economics | **stats** (separate; zero vector tables) |

Every cross-domain access goes through a real boundary (the `embeddings.store` API / the `search` engine
/ `memory.recall`) — never one domain reaching into another's tables. No reach-arounds.

---

## 9. Substrate-ready roadmap (do NOT foreclose)

Possible *only because* the substrate is a pure function of canon (§0). Build the substrate so these are
additive later, never a schema fight:
- **Trackers** — a single entry that updates in place (relationship status / inventory / plot threads).
- **Clips** — user-pinned one-off facts.
- **User-curated long-term promotion** — hand-pick what persists.
- **Per-chat summarizer profiles.**

> **Seam reservation (council 2026-06-25 — reserve now, build v2).** These roadmap items are the apex
> of the substrate (the AI-native "synthesize, don't just retrieve" swing — `reports/COUNCIL-REVIEW.md`).
> To keep them free without solidifying as untyped JSON, type the union NOW even with zero behavior:
> `ClipKind ∈ 'fact'|'trait'|'relationship'|'world-state'|'plot-thread'`,
> `ClipSourceKind ∈ 'user'|'synthesized'|'promoted'` (never auto-delete a `'user'` clip),
> `clip.scope ∈ 'character'|'chat'|'global'` — all in `@orb/contracts/memory`. A `{{world_state}}` macro
> lands in the same dynamic/cache-safe slot as `{{memory}}`; a `reconcile-world-state` `WorkloadKind` is
> the reconciler (reserved in `domains/workloads.md`). The Narrative Director (a per-chat `'observer'`
> agent) + cross-chat character coherence build on de-pin + search's cross-chat scope. (ledger §5.)

---

## 10. Knobs (per-preset where user-facing)

`blockSize` (16) · `verbatimWindow` (30) · `mode` (off/mixA/mixB/mixC/tiered) · `fanOut` (8) ·
`maxTier` · `retrieveK` · `rerankTo` · `minScore` · `keywordMatch` · `summarizer` (NOT a separate model —
a `chat`-turn shaped on whatever chat backend the user has, per `tiers/providers.md` §2b; `maxTokens`,
`temperature`).

---

## 11. Invariants (the things a gate should protect)

1. Substrate is a **pure function of canon** — never a second source of truth.
2. Build **never blocks the reply** (post-commit / backfill only).
3. **One embedding space** (one model/dim); **one write path** (`embeddings.store`).
4. **One retrieval engine** (`search`) — memory + discovery call it, never reimplement cosine.
5. `hub_score` is **never nulled by a vector write**.
6. **Scoped recall is egocentric-only.**
7. `discovery` (semantics) and `stats` (economics) **share no tables**; discovery computes no usage
   rollup.
