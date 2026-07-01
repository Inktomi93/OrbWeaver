# Domain: memory

> The builder and chat-scoped recall policy.

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
2. **Build never blocks the reply.** Substrate construction runs _after_ a turn commits
   (fire-and-forget) or in bulk backfill — never on the send hot path.

---

## 3. `memory` — the builder + the chat-scoped recall

`memory` is a **`chat/` subsystem** (LOCKED — `core/Core-0-Architecture-and-Structure.md §4` + `domains/chat.md`). Substrate-mediated:
only `chat/context.ts` reaches into it. The _shared_ substrate (the vector tables) is owned by
**`embeddings`**; the _retrieval mechanism_ is `search`'s. Memory owns exactly two things: digest
GENERATION and the `{{memory}}` recall POLICY.

**Host-only execution (invariant).** Both the build and the recall run under the turn's **`runAsUserId`
(the host)** — never the triggering member (`triggeredBy`). One memory per chat, host-owned (D16 host-
only-corpus; owner derives via the chat FK, D20). A member never builds or owns a parallel memory — but
a member-triggered turn (which runs _as_ the host) still **gets** the recall, because `{{memory}}` lands
in the shared prompt. "Only the host runs it" + "everyone benefits from it" are both true. A gate keys
memory ops off `runAsUserId`, never the member.

### 3a. The build (the SillyTavern-summarizer replacement)

- Triggered **post-turn** (fire-and-forget, never blocks the reply) and by **import backfill** — same
  functions, same result.
- **Two guards — TWO DIFFERENT WINDOWS; do not conflate them (one is fixed + build-side, the other is
  token-driven + recall-side):**
  - _Build-protect_ — the **FIXED** `verbatimWindow` (a small message **count**, default 8). The build cutoff
    `cutoff = maxSeq − verbatimWindow`: only blocks fully **aged out of the live tip** are digested.
    Small-on-purpose so a block is digested aggressively and there is **never a gap** (aged-out-but-undigested-
    and-out-of-window → forgotten). It is ST's `protect` zone, a **budget-INDEPENDENT constant**, NOT a
    context-budget knob. Its job is **no gap**.
  - _Recall window-filter_ — the **TOKEN-DRIVEN, VARIABLE** live history window (often **50–200 messages** on
    a real model, i.e. usually **far larger than `verbatimWindow`'s fixed 8**). At recall, drop any candidate
    digest whose seq-span is still inside **this turn's** live window — its scene is already **verbatim** in the
    prompt, so re-injecting its digest into `{{memory}}` is pure **redundancy**. The cutoff (`liveWindowCutoffSeq`
    — the seq below which messages are NOT in this turn's prompt) is **supplied by the engine from the §8
    history-budget fit** (the same drop math the assembler uses), NOT derived from `verbatimWindow`. **Boundary
    (exact):** a digest starting **at** the cutoff is still in the window (dropped); a digest starting
    **strictly below** it has aged out (surfaced). Applied **uniformly to the pool BEFORE the mode dispatch** —
    every mode (mixA / tiered / mixB / mixC), never a per-mode branch, never a search-side `verbatimWindow`
    delegation. Its job is **no redundancy**. **Why both:** when the live window (variable) exceeds the fixed
    `verbatimWindow` — the common case — blocks between them are BOTH digested AND still verbatim; relying on
    build-protect alone would re-inject them. This recall-side filter is the fix.
- **Trigger discipline (no spurious early runs — observability invariant).** A **fresh chat does ZERO
  memory/embed work** until the first block ages out:
  - The build does a **cheap pre-check** — "is there a new complete aged-out block since the last build?"
    (compare newest-digestable `blockIdx` to the max existing digest `blockIdx`) — and **skips entirely**
    (no load, no hash, no summarize, no embed) when there isn't. The self-heal/`content_hash` path only
    re-checks blocks an aged-out edit/reorg could have changed.
  - The recall (§3b) **early-returns before embedding** when `mode==off` or the digest pool is empty — so
    the per-turn query embed never fires on a chat with no digests.
  - Testable invariants: _"recall does not embed on an empty pool"_ and _"build issues no summarizer call
    when no block has aged out."_
- **Embeds via `embeddings.store`** — memory never inserts a vector itself.
- **Self-heals (hash-diff):** a block is re-digested _only if_ missing or stale (`content_hash` changed —
  seq-span changed, a message edited, a re-attribution, **or a scope/mode change**, §4). Swipes/edits at
  the live tip never touch settled digests (the protect zone shields them). A fork **lazily rebuilds only
  what diverged**, reusing the parent's digest `text` for identical-`content_hash` blocks (skip the
  summarizer call).
- **Summarizer = a `chat`-turn on the user's own backend** (NOT a separate model; `core/Tier-3b-Providers.md`
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
- `{{memory}}` lands in the **dynamic (cache-safe) half** of the system prompt, _after_ the cache
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
- The _read mechanism_ is search's; memory owns the **scope + window + mode + assembly** policy.

---

## 4. Group scoping — one `CharacterId` key, egocentric `scoped` recall, mode-switch-safe

The unified single-system design (solo and group are the SAME path — D16, `no-if(isGroup)`). The digest
scope key **`scopedCharacterId` is ALWAYS a real `CharacterId`** (FK → `characters`; never the `''`
sentinel, never NULL) — "whose memory is this":

| Room kind              | `scopedCharacterId` (the bucket)                                              | Recall (what the speaker gets)            |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| **solo** (roster-of-1) | the single cast character's id — the room _is_ that character                 | that character's bucket                   |
| **merged / narrator**  | the **synthetic group-as-character** (`__group__${chatId}`, a real hidden id) | the shared room bucket                    |
| **scoped**             | **each cast character's id** (per-character egocentric)                       | the active speaker's own witnessed bucket |

There is **no special-case empty-string sentinel** — solo flows through the exact same keying as a group,
just with one character. **`narrator` (an output mode) ≠ the synthetic group character (the identity):**
the synthetic character is what the merged/narrator bucket is keyed to AND what _authors_ narrator
messages (`messages.characterId` = the group char, a real id, never NULL); narrator is one of the output
modes that _reads_ that shared bucket. orbweaver is a step ahead of neo here — neo _stamped_ the group
character's cv to dodge a `NOT NULL cv` rebuild; orbweaver dropped the cv entirely (D28), so the real id
lives directly in the key.

**Built IN FULL (not deferred — orbweaver does the comprehensive thing neo phased):**

- **`scoped` per-character memory** is fully built, not an opt-in afterthought. Each character has its own
  egocentric bucket; recall reads only the active speaker's.
- **The present-at-seq WITNESSING predicate** — a character's scoped bucket contains only blocks it was
  actually present for, computed from the **`joinSeq`/`leftSeq` horizons** on `chat_participants` (NOT
  `messages.excludedFromPrompt`, a single global boolean that cannot express per-character witnessing). A
  character genuinely cannot recall a scene it wasn't in — including across kick/re-add intervals.
- **`chat_digest_speakers`** ("which characters a block _contains_") backs by-character search across
  rooms regardless of the egocentric bucketing ("search my memories of Alice" finds her lines inside
  group rooms). The **`isGroup`/`roomKind` tag** partitions CSLS/themes analytics so group rows don't
  blend into the host's per-owner analytics. The synthetic group char is **hidden / no card embedding**
  (never pollutes character similarity).

**Mode-switch within a chat (merged ↔ scoped ↔ narrator) — the scope is part of the digest IDENTITY, not
a global setting; no eager re-digest, no loss:**

- **narrator ↔ merged is a memory no-op** — both write+read the same shared (group-as-character) bucket;
  only generation differs.
- The real transition is **shared (merged/narrator) ↔ scoped.** Each block is digested under whatever
  scope was active _when it aged out_ (folded into `content_hash`); a merged/narrator-era block → the
  shared bucket, a scoped-era block → per-character buckets (witnessing-gated). **Recall reads the shared
  bucket ∪ the speaker's own per-character bucket, witnessing-filtered** — so merged-era blocks are
  recalled by everyone, scoped-era blocks only by the witnessing character. One rule covers always-
  merged, always-scoped, and any toggle sequence: **no `if(currentMode)` branch, no eager re-digest, and
  a character never loses memory of a scene it witnessed.** (An _always_-scoped chat has no shared
  digests, so recall is egocentric-only — inv 6 holds; only a genuinely _switched_ chat reads both,
  because the merged era genuinely _was_ shared.)
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

**The numbers are grounded DEFAULTS, the _principle_ is the invariant.** neo tuned these against **real
imported ST chats** (more grounded than the diagram's theoretical `16/30/8`, which never filled tiers at
real chat lengths — `fanOut 8 × blockSize 16` needs 128 messages for tier-1, 1024 for tier-2). The
grounded defaults: **`blockSize 8` · `fanOut 4` · `verbatimWindow 8` · `maxTier 3`** — tier-1 fills at 32
messages, tier-2 at 128, tier-3 at 512, so tiering actually engages at typical lengths. They stay
**tunable knobs** (§10, decide-during-build); the real invariants are: _the summarizer block fits the
smallest realistic summarizer context_ (token-guarded, §3a — `blockSize 8 ≈ 3k tok` fits a tiny local
main, 32k, or hosted 200k; bigger would footgun small-main users) and _tiers consolidate at typical chat
length_.

---

## 9. Substrate-ready roadmap (reserve the CONTRACT seams now, build the behavior later)

Possible _only because_ the substrate is a pure function of canon (§0). These are **net-new feature
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

## 8. Ownership & boundaries (summary)

| Concern                                                                                               | Owner                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| vector store, single write path, one space, `content_hash`, `hub_score` column                        | **embeddings**                           |
| substrate build (summarizer: block→segment+digest+tier; group-aware; self-heal; fork-lazy; host-only) | **memory**                               |
| `{{memory}}` recall policy (scope=chat, window, mode, bridge-pool, assembly, mode-switch)             | **memory** (calls search)                |
| the retrieval engine (vector: scope×lens×rerank; membership-gated cross-chat; + lexical BM25)         | **search**                               |
| themes/hubness/dup/distill + computes `hub_score`                                                     | **discovery**                            |
| turn economics                                                                                        | **stats** (separate; zero vector tables) |

Every cross-domain access goes through a real boundary (`embeddings.store` / `search` / `memory.recall`)
— never one domain reaching into another's tables.

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

# --- Merged from knowledge-cluster ---

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
2. **Build never blocks the reply.** Substrate construction runs _after_ a turn commits
   (fire-and-forget) or in bulk backfill — never on the send hot path.

---

## 3. `memory` — the builder + the chat-scoped recall

`memory` is a **`chat/` subsystem** (LOCKED — `structure.md §4` + `domains/chat.md`). Substrate-mediated:
only `chat/context.ts` reaches into it. The _shared_ substrate (the vector tables) is owned by
**`embeddings`**; the _retrieval mechanism_ is `search`'s. Memory owns exactly two things: digest
GENERATION and the `{{memory}}` recall POLICY.

**Host-only execution (invariant).** Both the build and the recall run under the turn's **`runAsUserId`
(the host)** — never the triggering member (`triggeredBy`). One memory per chat, host-owned (D16 host-
only-corpus; owner derives via the chat FK, D20). A member never builds or owns a parallel memory — but
a member-triggered turn (which runs _as_ the host) still **gets** the recall, because `{{memory}}` lands
in the shared prompt. "Only the host runs it" + "everyone benefits from it" are both true. A gate keys
memory ops off `runAsUserId`, never the member.

### 3a. The build (the SillyTavern-summarizer replacement)

- Triggered **post-turn** (fire-and-forget, never blocks the reply) and by **import backfill** — same
  functions, same result.
- **Two guards — TWO DIFFERENT WINDOWS; do not conflate them (one is fixed + build-side, the other is
  token-driven + recall-side):**
  - _Build-protect_ — the **FIXED** `verbatimWindow` (a small message **count**, default 8). The build cutoff
    `cutoff = maxSeq − verbatimWindow`: only blocks fully **aged out of the live tip** are digested.
    Small-on-purpose so a block is digested aggressively and there is **never a gap** (aged-out-but-undigested-
    and-out-of-window → forgotten). It is ST's `protect` zone, a **budget-INDEPENDENT constant**, NOT a
    context-budget knob. Its job is **no gap**.
  - _Recall window-filter_ — the **TOKEN-DRIVEN, VARIABLE** live history window (often **50–200 messages** on
    a real model, i.e. usually **far larger than `verbatimWindow`'s fixed 8**). At recall, drop any candidate
    digest whose seq-span is still inside **this turn's** live window — its scene is already **verbatim** in the
    prompt, so re-injecting its digest into `{{memory}}` is pure **redundancy**. The cutoff (`liveWindowCutoffSeq`
    — the seq below which messages are NOT in this turn's prompt) is **supplied by the engine from the §8
    history-budget fit** (the same drop math the assembler uses), NOT derived from `verbatimWindow`. **Boundary
    (exact):** a digest starting **at** the cutoff is still in the window (dropped); a digest starting
    **strictly below** it has aged out (surfaced). Applied **uniformly to the pool BEFORE the mode dispatch** —
    every mode (mixA / tiered / mixB / mixC), never a per-mode branch, never a search-side `verbatimWindow`
    delegation. Its job is **no redundancy**. **Why both:** when the live window (variable) exceeds the fixed
    `verbatimWindow` — the common case — blocks between them are BOTH digested AND still verbatim; relying on
    build-protect alone would re-inject them. This recall-side filter is the fix.
- **Trigger discipline (no spurious early runs — observability invariant).** A **fresh chat does ZERO
  memory/embed work** until the first block ages out:
  - The build does a **cheap pre-check** — "is there a new complete aged-out block since the last build?"
    (compare newest-digestable `blockIdx` to the max existing digest `blockIdx`) — and **skips entirely**
    (no load, no hash, no summarize, no embed) when there isn't. The self-heal/`content_hash` path only
    re-checks blocks an aged-out edit/reorg could have changed.
  - The recall (§3b) **early-returns before embedding** when `mode==off` or the digest pool is empty — so
    the per-turn query embed never fires on a chat with no digests.
  - Testable invariants: _"recall does not embed on an empty pool"_ and _"build issues no summarizer call
    when no block has aged out."_
- **Embeds via `embeddings.store`** — memory never inserts a vector itself.
- **Self-heals (hash-diff):** a block is re-digested _only if_ missing or stale (`content_hash` changed —
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
- `{{memory}}` lands in the **dynamic (cache-safe) half** of the system prompt, _after_ the cache
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
- The _read mechanism_ is search's; memory owns the **scope + window + mode + assembly** policy.

---

## 4. Group scoping — one `CharacterId` key, egocentric `scoped` recall, mode-switch-safe

The unified single-system design (solo and group are the SAME path — D16, `no-if(isGroup)`). The digest
scope key **`scopedCharacterId` is ALWAYS a real `CharacterId`** (FK → `characters`; never the `''`
sentinel, never NULL) — "whose memory is this":

| Room kind              | `scopedCharacterId` (the bucket)                                              | Recall (what the speaker gets)            |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| **solo** (roster-of-1) | the single cast character's id — the room _is_ that character                 | that character's bucket                   |
| **merged / narrator**  | the **synthetic group-as-character** (`__group__${chatId}`, a real hidden id) | the shared room bucket                    |
| **scoped**             | **each cast character's id** (per-character egocentric)                       | the active speaker's own witnessed bucket |

There is **no special-case empty-string sentinel** — solo flows through the exact same keying as a group,
just with one character. **`narrator` (an output mode) ≠ the synthetic group character (the identity):**
the synthetic character is what the merged/narrator bucket is keyed to AND what _authors_ narrator
messages (`messages.characterId` = the group char, a real id, never NULL); narrator is one of the output
modes that _reads_ that shared bucket. orbweaver is a step ahead of neo here — neo _stamped_ the group
character's cv to dodge a `NOT NULL cv` rebuild; orbweaver dropped the cv entirely (D28), so the real id
lives directly in the key.

**Built IN FULL (not deferred — orbweaver does the comprehensive thing neo phased):**

- **`scoped` per-character memory** is fully built, not an opt-in afterthought. Each character has its own
  egocentric bucket; recall reads only the active speaker's.
- **The present-at-seq WITNESSING predicate** — a character's scoped bucket contains only blocks it was
  actually present for, computed from the **`joinSeq`/`leftSeq` horizons** on `chat_participants` (NOT
  `messages.excludedFromPrompt`, a single global boolean that cannot express per-character witnessing). A
  character genuinely cannot recall a scene it wasn't in — including across kick/re-add intervals.
- **`chat_digest_speakers`** ("which characters a block _contains_") backs by-character search across
  rooms regardless of the egocentric bucketing ("search my memories of Alice" finds her lines inside
  group rooms). The **`isGroup`/`roomKind` tag** partitions CSLS/themes analytics so group rows don't
  blend into the host's per-owner analytics. The synthetic group char is **hidden / no card embedding**
  (never pollutes character similarity).

**Mode-switch within a chat (merged ↔ scoped ↔ narrator) — the scope is part of the digest IDENTITY, not
a global setting; no eager re-digest, no loss:**

- **narrator ↔ merged is a memory no-op** — both write+read the same shared (group-as-character) bucket;
  only generation differs.
- The real transition is **shared (merged/narrator) ↔ scoped.** Each block is digested under whatever
  scope was active _when it aged out_ (folded into `content_hash`); a merged/narrator-era block → the
  shared bucket, a scoped-era block → per-character buckets (witnessing-gated). **Recall reads the shared
  bucket ∪ the speaker's own per-character bucket, witnessing-filtered** — so merged-era blocks are
  recalled by everyone, scoped-era blocks only by the witnessing character. One rule covers always-
  merged, always-scoped, and any toggle sequence: **no `if(currentMode)` branch, no eager re-digest, and
  a character never loses memory of a scene it witnessed.** (An _always_-scoped chat has no shared
  digests, so recall is egocentric-only — inv 6 holds; only a genuinely _switched_ chat reads both,
  because the merged era genuinely _was_ shared.)
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

**The numbers are grounded DEFAULTS, the _principle_ is the invariant.** neo tuned these against **real
imported ST chats** (more grounded than the diagram's theoretical `16/30/8`, which never filled tiers at
real chat lengths — `fanOut 8 × blockSize 16` needs 128 messages for tier-1, 1024 for tier-2). The
grounded defaults: **`blockSize 8` · `fanOut 4` · `verbatimWindow 8` · `maxTier 3`** — tier-1 fills at 32
messages, tier-2 at 128, tier-3 at 512, so tiering actually engages at typical lengths. They stay
**tunable knobs** (§10, decide-during-build); the real invariants are: _the summarizer block fits the
smallest realistic summarizer context_ (token-guarded, §3a — `blockSize 8 ≈ 3k tok` fits a tiny local
main, 32k, or hosted 200k; bigger would footgun small-main users) and _tiers consolidate at typical chat
length_.

---

## 9. Substrate-ready roadmap (reserve the CONTRACT seams now, build the behavior later)

Possible _only because_ the substrate is a pure function of canon (§0). These are **net-new feature
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

## 8. Ownership & boundaries (summary)

| Concern                                                                                               | Owner                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| vector store, single write path, one space, `content_hash`, `hub_score` column                        | **embeddings**                           |
| substrate build (summarizer: block→segment+digest+tier; group-aware; self-heal; fork-lazy; host-only) | **memory**                               |
| `{{memory}}` recall policy (scope=chat, window, mode, bridge-pool, assembly, mode-switch)             | **memory** (calls search)                |
| the retrieval engine (vector: scope×lens×rerank; membership-gated cross-chat; + lexical BM25)         | **search**                               |
| themes/hubness/dup/distill + computes `hub_score`                                                     | **discovery**                            |
| turn economics                                                                                        | **stats** (separate; zero vector tables) |

Every cross-domain access goes through a real boundary (`embeddings.store` / `search` / `memory.recall`)
— never one domain reaching into another's tables.

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

> **See also:** [embeddings.md](embeddings.md) · [memory.md](memory.md) · [search.md](search.md) · [discovery.md](discovery.md)
