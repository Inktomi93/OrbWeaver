---
kind: review
status: active
updated: 2026-08-19
---

# Memory-system end-to-end verification (lane memory-verify, #327)

Scope: the conjoined vector-storage + summary memory system — every retrieval mode in
`domain/chat/memory/recall/**` + `domain/search/verbs/{digests,segments,search}.ts`, audited against the
owner's neo design PDF (`memory-diagram (1).pdf`, 14 pp — the retrieval-SHAPE reference; numbers updated
since), plus a live probe of the longest real chat (222 messages) INCLUDING an owner-authorized
boosted-knob rebuild (`fanOut 2 · maxTier 4`) run against a SCRATCH COPY of the db through the real
composed service graph + the live local engines. The live db and live settings were never touched.

Verdict in one line: **the machinery is excellent — tiering math, self-heal, retrieval, rerank, and
observability all proved out exactly to spec on real data — but the consolidation tier ships a
systematic confabulation defect (facts-stripped input) that poisons precisely the arcs the D55 bridge
makes load-bearing, and the recall query is structurally one turn stale.**

## 1. Per-mode audit (off / mixA / mixB / mixC / tiered)

| Mode | Wired (evidence rung) | Right shape vs PDF | Efficiency | Gaps |
| - | - | - | - | - |
| **off** | called-in-live-path — `recall.ts:57` early-returns `""` BEFORE any load/embed; build no-ops (`build/digests.ts:152`); the backfill workload REFUSES admission when the host is off (`workload-contributions.ts:33`) | ✓ | zero-cost; no recall-phase bus event emitted (an absent event is the idle brain icon, `recall.ts:64-68`) | none |
| **mixA** | called-in-live-path — `recall.ts:264-268`: tier-0 only, blockIdx-chronological, pure assembly, `queryEmbedded:false` | ✓ (PDF §6 "all tier-0 digests of this chat") | no embed, one scoped digest read | unbounded injection by design (a 1000-msg chat ⇒ 60+ digests — the PDF's own motivation for tiered) |
| **mixB** | called-in-live-path — `recall.ts:270-284` → `search/verbs/digests.ts`: embed query → cosine → CSLS → `minScore` floor (+`keywordMatch` rescue) → `retrieveK` cut | **diverges from PDF, by RULING**: PDF §6 scans "THIS chat's tier-0 digests"; live code scans the **bridge** (`candidates: bridge`, `recall.ts:276`) — D55: "Retrieval is over the BRIDGE, never flat tier-0", pinned by `tests/.../recall.int.test.ts:416` | 1 embed + 1 scoped scan per turn; empty-pool/empty-candidates early-return BEFORE embed (`recall.ts:87`, `digests.ts:39`) | see §3 P6 — the fine tier-0 rows of the covered past are unreachable; only their (confabulation-prone) arc is in the pool |
| **mixC** | called-in-live-path — mixB + cross-encoder rerank `ctx.roleClients.rerank` (`digests.ts:91` → `substrate/rerank.ts`), capped `rerankTo` | same bridge divergence; rerank per PDF | + 1 rerank call (≤ `retrieveK` pairs, small); **proved live**: debug-ring receipts below | rerank runs bare (no scope instruction) unlike the corpus path — §3 P3 |
| **tiered** | called-in-live-path — `recall.ts:272-273` → `computeBridge` (`bridge.ts:41-84`): greedy highest-non-overlapping-tier coverage of the coarse past + the most-recent `fanOut` fine tier-0, chronological, no embed | ✓ (PDF §5/§6 exactly — incl. "a tier-0 inside a surfaced higher tier is never also surfaced") | pure math + one scoped read | arcs it surfaces for the deep past are the defective ones (§3 P1) |

The mode default is **mixC** (`DEFAULT_MEMORY_DEFAULTS`, `contracts/settings/index.ts:118-130`:
`blockSize 8 · verbatimWindow 8 · queryWindow 2 · fanOut 4 · maxTier 3 · retrieveK 8 · rerankTo 3 ·
minScore 0.25 · keywordMatch true · recencyBias 0`). No `memoryDefaults` override exists in the live
`settings` row (probed) — the grounded floor is what runs.

Search-verb siblings: `verbs/segments.ts` (verbatim lens, chunk-collapse per #172, egocentric key
required — flag-don't-fake) and `verbs/search.ts` (omnibox dispatch, every digest scope owner-belted;
segments owner-gated against the materialized chat set) are wired and shape-correct; within-chat
`{{memory}}` recall calls ONLY `searchDigests` (`recall.ts:2`) — segments serve the corpus/omnibox
lens, matching PDF §6's two-scopes split.

Flow into the prompt (verified): `recallMemory` → `gatherMemory` (`substrate/assemble-gather.ts:226`)
→ `AssembleContext.memory` → the `{{memory}}` macro (`assembly/assemble.ts:367`, `assembly/macros.ts:104`)
→ the preset's dynamic/cache-safe half (`contracts/memory/index.ts:11`, `contracts/preset/index.ts:654`)
— PDF §7 honored. Per-speaker witnessed re-run (D6) replaces text AND trace atomically
(`engine/engine.ts:1253-1272`). The recall window-filter (`recall/window.ts`, cutoff = the previous
turn's `contextBoundaryMessageId` seq, `assemble-gather.ts:248-258`) correctly suppresses digests still
verbatim in the live window. Context-cap note: with the stale 32k preset cap the fit boundary sat HIGH,
so more digests legitimately surfaced ("over-firing" was the correct response to a small window); the
fixed 65 536 cap lowers the cutoff and suppresses more — working as designed.

## 2. The longest-chat probe (real owner corpus, 222 messages)

Chat `chat_01m0a0vtmmesq84qnf758eyyk1` ("Bess — Feb 16, 2026 (2)") — the same story world as the PDF's
own examples. All queries against a scratch copy (`/tmp/memory-verify/probe.db`); provenance verified
(the 222-message max matches the PDF's "222-message chat"; embed space `Qwen/Qwen3-VL-Embedding-2B`,
dim 1024, matches the live embed engine).

### 2a. Default-knob grid (as found, blockSize 8 · fanOut 4 · maxTier 3)

- Segments: 26 blocks (idx 0–25), spans seq 0–207 — exact for cutoff `221 − 8 = 213` ⇒ 26 complete
  8-row blocks. ✓
- Digests: tier 0 = 26 (idx 0–25) · tier 1 = 6 (26÷4) · tier 2 = 1 (6÷4) · tier 3 = none (1 < fanOut —
  the consolidation ceiling stopped correctly). One scope bucket (solo chat). **fanOut grouping exact.** ✓

### 2b. Boosted rebuild (owner-authorized): fanOut 2 · maxTier 4, scratch copy, real engines

Copy trimmed to the one chat; `memoryDefaults {"fanOut":2,"maxTier":4}` written into the COPY's
settings row; the real `memory-backfill` workload contribution run through `createServices` composed
against the copy (driver: `/tmp/memory-verify/driver.ts`; log: `/tmp/memory-verify/backfill.log`).

Result — **exactly the predicted ladder, first try**:
`{"segments":{"scanned":1,"changed":0},"digests":{"scanned":1,"changed":23},"failed":0}`; exactly 23
vLLM summarize calls (13 + 6 + 3 + 1). Grid after: tier 0 = 26 · tier 1 = 13 · tier 2 = 6 ·
tier 3 = 3 · tier 4 = 1. The 26 unchanged tier-0 blocks were ALL hash-skipped (0 re-summaries — the
content-hash self-heal works); the old fanOut-4 tier-1/2 rows were overwritten in place by the new
grouping with no strays above any ceiling. Incomplete groups (tier-1 idx 12, tier-3 idx 2) correctly
deferred. **Consolidation mechanics: fully correct.**

### 2c. Digest quality — tier 0 is excellent; the arcs confabulate

Tier-0 digests are genuinely good: accurate `[entities — scene]` anchors, significance-filtered facts,
15–30 distinctive keywords. Exemplar (block 14, relationally precise): "Bess confides in Nate that her
sexual disconnect from **her husband, Liam** … The therapist clarifies **Nate's role is not as a couple
partner** but as a significant support figure."

The consolidation tier is where quality dies, and the mechanism is identified: the consolidation input
is `renderDigestFacets(child)` = **anchor + keywords ONLY** (`build/digests.ts:489`,
`substrate/parse.ts:60-67` — `FLAG[no-digest-body]`). The facts body IS persisted (`chat_digests.text`
is NOT NULL and holds the full three-part unit — the FLAG's "facts body is not persisted" is stale as a
claim about the row; only the parsed FACET columns lack it), but it never reaches the consolidation
prompt. Fed titles + keyword soup, the summarizer invents relations:

- tier-1 b7 (children b14+b15, BOTH of which name Liam as the husband): "a therapeutic journey
  involving Bess and **their spouse, Nate** … an eight-year marriage crisis".
- tier-2 b3: "a nostalgic, intimate **Christmas morning in Samui**" — **Samui is the dog**, turned into
  a place by a bare keyword.
- tier-3 b1: "the **eight-year marriage of Bess and Nate**".
- The original fanOut-4 build has the same class (tier-1 b3 "Nate and Bess's … marital breakdown rooted
  in twelve years of neglected intimacy"; tier-2 b0 "Nate and Bess's twelve-year marriage undergoes a
  profound reconciliation arc") — verified false against the verbatim segment for block 14 ("one of
  Liam's old hoodies"; "He touched me last night … first time since March").

Reproduced across two independent builds (fanOut 4 and fanOut 2) — **systematic, not sampling noise**.

Second arc defect, same root: **depth starvation**. At tier ≥ 3 the summarizer increasingly returns
anchor+keywords with NO narrative body at all (tier-3 b2 and tier-4 b0 are title + keywords only) — the
"story so far" for the deep past collapses to a keyword list, and nothing guards the output shape.

### 2d. Retrieval + rerank quality (real engines, boosted grid, `search.digests` chat scope)

(`/tmp/memory-verify/search.log`; this dispatch scans ALL tiers — no bridge cut — so it isolates the
embed/cosine/CSLS/rerank stack.)

- "what did Nate bring when he first introduced himself?" → **top-1 = t0 b0** (rel 0.693) — the
  gumbo/cornbread/sweet-tea block. The PDF §6 discrimination claim holds on this stack.
- "the therapy session where the therapist clarified Nate's role" → cosine ranked b16 (.761), b17
  (.749), b22 (.738) ABOVE the true block b14 (.710) — and the **cross-encoder promoted b14 to top-1**.
  The mixC rerank demonstrably earns its latency on a question-style query.
- A raw RP-transcript-style query (what recall actually sends) still retrieved topically (t1 b7,
  rel .58) but with visibly flatter margins.
- CSLS note: `score` is the clamped adjusted distance (`csls.ts:9-11`) — in a single-topic chat nearly
  everything clamps to 0 and ties break on raw distance (documented, deliberate); `relevance` is the
  readable number.

### 2e. Live-path receipts (the running stack, read-only)

`/api/_debug/memory/recalls` (X-Debug-Token): three real turns in chat `…q3g3myed`, `mode mixC`,
`queryEmbedded true`, pool 3 → 3 admitted with scores/relevance, 51–88 ms, verdict ledger populated,
brain-icon phase events paired (#250/#313). The recall pipeline runs per live turn end to end. Note the
practical shape at defaults: with bridge ≈ 8 candidates, `retrieveK 8` never cuts and `rerankTo 3` is
the real selector — `{{memory}}` ≈ top-3 blocks per turn.

Behavioral tier, cold run on today's tree: `pnpm vitest run tests/server/domain/chat/memory
tests/server/domain/search/verbs/digests.int.test.ts tests/server/domain/search/verbs/segments.int.test.ts`
→ **18 files, 172/172 green** (includes the #251 eval harness, #311 knob-flip controls, #314 boundary
flips).

## 3. Prioritized defects (each a candidate issue)

1. **P1 — Consolidation input drops the persisted facts body → systematic arc confabulation.**
   `build/digests.ts:487-491` feeds `renderDigestFacets` (anchor+keywords) instead of the stored
   three-part text; receipts in §2c. Compounding: under D55 bridge retrieval the arc is the ONLY
   reachable representation of the covered past, and tiered/mixC inject these arcs into `{{memory}}` —
   the memory system can actively teach the model a marriage that never happened. Fix candidate: feed
   `parseDigest(child.text).facts` (or the whole stored text) into `consolidationUserPrompt`, with the
   token-guard extended to consolidations; truth-repair the stale `FLAG[no-digest-body]` comment either
   way. Cost measured: input would grow from ~300 tok to ~1–2k tok per consolidation — well inside the
   summarizer window.
2. **P1b — Depth starvation: tier ≥ 3 arcs collapse to anchor+keywords (no narrative).** Same root +
   no output-shape guard; an empty-facts consolidation should be flagged/retried like a blank digest is.
3. **P2 — The recall query excludes the current user message.** Recall runs pre-persist
   (`verbs/turn.ts:1364` builds context; `:1396` persists the user row) and `gatherMemory` takes no
   `pendingUserText` — while the DATABANK gather right beside it does (`assemble-gather.ts:60-82`). The
   mixB/mixC query = the last `queryWindow 2` CANON rows = the PREVIOUS turn's tail; the single most
   retrieval-relevant text of the turn never contributes. Fix candidate: fold `pendingUserText` into
   `buildRecallQuery`'s window exactly as the databank sibling does.
4. **P3 — Instruction asymmetry between the two digest scan paths.** The corpus path embeds with
   `SCOPE_INSTRUCTIONS.digests.query` and prefixes the rerank with `.rerank`
   (`verbs/search.ts:66-68,107-109`); the within-chat recall path embeds and reranks BARE
   (`verbs/digests.ts:47,91`). The engines are instruction-aware (Qwen3-VL family) — within-chat recall
   forgoes conditioning the corpus path deemed load-bearing.
5. **P4 — Dead knobs on the wire (known).** `recencyBias` accepted-not-applied (`digests.ts:7-8`
   FLAG[PD-35], #321) and `verbatimWindow` rides `MemoryQueryOptions` but no verb reads it.
6. **P5 — `parseDigest` misses a keywords list that does not start its own line.** Real row: tier-0 b5
   has "Keywords: …" inline after the final fact sentence → stored `keywords = []`
   (`substrate/parse.ts:8` anchors `^\s*keywords:`), so the keyword-rescue and the consolidation facet
   lose that block's keywords. Robustness gap, one measured instance in 26.
7. **P6 — Owner design question (not a relitigation of D55).** The ruled bridge-restricted mixB/mixC
   means a SPECIFIC early-scene query can never surface the precise tier-0 digest once its span is
   consolidation-covered — only the coarse arc (PDF §6's "block 1 vs block 2" discrimination is
   structurally unavailable for the covered past). The ruling's INPUT has changed: §2c shows the arcs
   are currently the least reliable rows in the pool. Once P1 lands this trade gets much better; until
   then tiered/mixC quality for long chats is bounded by arc quality. An alternative arm if wanted:
   include covered tier-0 rows as candidates for the SCAN while keeping the bridge for pure-assembly
   modes (a knob, not a reversal).
8. **P7 — Minor: mixB/mixC inject in rank order** (`format.ts` preserves caller order) — a
   non-chronological "story so far". mixA/tiered are chronological. Owner taste call.

## 4. What was NOT covered

- No live generation turn was driven; `{{memory}}` content reaching an actual model wire was verified
  to the assembled-context/macro seam + the live ring, not to a captured provider payload.
- Witnessing/join-leave horizons: audited in code + covered by the green suites; not probed live (the
  target chat is solo — no scoped bucket exists to diverge).
- Cross-chat corpus search quality at scale (verb audited + suites green; not driven over the 895-chat
  corpus).
- Rerank score calibration (only relative ordering was judged); `embeddings.store` internals.
- The live db was READ-ONLY throughout: the boost, trim, and rebuild all ran against
  `/tmp/memory-verify/probe.db` (scratch artifacts: `driver.ts`, `backfill.log`, `search.log`,
  `suites.log`, `recalls.json` in `/tmp/memory-verify/` — disposable). The live stack's engines were
  used for inference only (adopt-only; 23 summarize + a handful of embed/rerank calls).
