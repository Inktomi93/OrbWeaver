# 03 — Sprite-Sheet Generation (the B1 fold-in — the headline addition)

> **Status: COMMITTED into this domain (Marinara-Residue §1 B1, decided: expressions-owned).**
> Generate a full expression set from one prompt: sheet-compile → injected
> `imagery.generatePicture` → sharp grid-slice → matte → `assets.store` per cell → N
> `character_sprites` rows. Marinara evidence (one-line cites): `sprites.routes.ts` `/generate-sheet`
> — `compileSpritePrompt`, cells `cols×rows`, `MAX_INDIVIDUAL_SPRITE_EXPRESSIONS = 8`, sharp-slice,
> `tryRemoveBackgroundWithBackgroundRemover` matte. **This chunk is what resolves the committed
> doc's own gap:** the §6 Q3 no-sprites early-out otherwise makes the whole feature dead-on-arrival
> for anyone who won't hand-draw 28 emotions — the empty-sprite-set UI offers generation instead of
> a dead end.

---

## 0. Ownership (dictated, do not re-litigate)

Sprite-sheet generation is an **EXPRESSIONS capability** — domain-of-affect: the pass ends in
`character_sprites` row writes, which only this domain may make. `domain/imagery` is consumed BY
INJECTION (`imagery.generatePicture` — its committed verb, its committed param vocabulary:
mode/prompt/n/size) and owns zero sprite rows. This mirrors the D58 seam ("rpg owns no image bytes,
no sprite rows") and rpg-design/08 §1, where the game's "Party/NPC sprite sheets" row lists
`character_sprites` as the store and "the committed expressions stage" as the surface — the game
CONSUMES this verb (one vocabulary, one implementation; rpg's host button calls
`expressions.generateSpriteSheet` through injection when that enhancement builds).

## 1. The user story (why the shape below)

Character page (or the rpg host button) → "Generate expression sprites" → pick up to 8 labels
(default: a curated 8-subset of the GoEmotions seed: `joy, sadness, anger, surprise, fear,
embarrassment, amusement, neutral`) + optional style prompt → one async job → sprites appear in the
management grid → classify goes live for that character. Repeat with another label batch for a
fuller set.

**WHY the curated default 8:** the sheet cap is 8 (marinara's `MAX_INDIVIDUAL_SPRITE_EXPRESSIONS`),
and these 8 cover the emotional range a stage actually renders distinguishably; the remaining 20
GoEmotions labels are near-synonyms at sprite resolution (annoyance vs anger). `neutral` is ALWAYS in
the default set — it is the snap fallback target (02 §2.3).

## 2. The enqueue verb + the WorkloadKind

`generateSpriteSheet(caller, params)` (params zod: 01 §2 `generateSpriteSheetSchema`) validates the
character is caller-owned (`fetchOwned`), confirms the sheet ops are wired (else
`ExpressionsNotConfiguredError`), then enqueues via the injected `workloadsStart`:

```ts
// @orb/contracts/workloads — WorkloadKind gains one member (the <domain>-<task> convention):
| "expressions-sprite-sheet"

// ParamsByKind["expressions-sprite-sheet"] — the zod schema (workloads re-parses at start(), defense-in-depth):
z.object({
  characterId: typeIdSchema(ID_PREFIX.character),
  labels: z.array(expressionLabelSchema).min(1).max(8),
  stylePrompt: z.string().max(600).optional(),
  matte: z.enum(["model", "flood", "none"]), // resolved (defaulted) at the verb, explicit in the row (§4)
  ownerId: typeIdSchema(ID_PREFIX.user),    // the requesting principal — bills + scopes the imagery call
})

// ResultByKind["expressions-sprite-sheet"] (workload-owned projection, workloads.md discipline):
export interface SpriteSheetJobResult {
  readonly written: number;                 // rows upserted (== labels.length on success)
  readonly labels: readonly string[];
  readonly sheetAssetId: AssetId;           // the un-sliced sheet (kept — §6)
  readonly model: string;                   // provenance from GeneratedPicture
  readonly costUsd: number | null;
}
```

**WHY async (a workload) and not a synchronous verb:** image generation is tens of seconds; a
synchronous tRPC call would hang the UI and die on transport timeouts; the workloads engine already
gives progress SSE, cancel, retry, audit rows, and heartbeat/reap for free. Adding the kind is the
five mechanical edits of workloads.md (union member + params schema + result + runner file +
`RUNNERS` entry — `exhaustive-dispatch` keeps it honest). The workload RUNNER is thin: it calls
`ctx.env.expressions.runSpriteSheetJob(params, report, signal)` — the bulk pass lives in this
domain (workloads.md: "bulk-pass implementations live in their owning feature").

## 3. `runSpriteSheetJob` — the pass, step by step

### 3.1 The injected ops (contract/ops.ts — exact signatures)

```ts
export interface ImageryOp {
  /** domain/imagery's committed verb, committed vocabulary — mode/prompt/n/size (imagery.md §6). */
  generatePicture(p: {
    mode: "free";                            // the sheet prompt is fully literal — no LLM extraction step
    prompt: string;
    negative?: string;
    n: 1;                                    // one sheet per job
    size: "landscape" | "square";            // §3.3 picks per grid aspect
    quiet: true;                             // never posts to a chat
    userId: UserId;                          // bills/resolves as the requester
  }): Promise<GeneratedPicture>;             // { assetId, block, prompt, model, costUsd } — imagery.md §6.2
}

export interface ImageOps {                  // provided by infra/image (the sharp adapter — D6 precedent)
  /** Slice a grid image into row-major cells. sharp extract() per cell; cell = floor(w/cols) × floor(h/rows). */
  sliceGrid(bytes: Uint8Array, opts: { cols: number; rows: number }): Promise<readonly Uint8Array[]>;
  /** Corner-sampled flood-fill matte → transparent PNG. Deterministic, no ML — the zero-setup fallback (§4). */
  matteFlood(bytes: Uint8Array, opts: { tolerance: number }): Promise<Uint8Array>;
}

/** OPTIONAL — provided by infra/providers `local-light` when that backend is configured (§4).
 *  Compose passes it iff local-light is up; absence ⇒ the verb defaults matte to "flood". */
export type MatteModelOp = (
  bytes: Uint8Array,
  opts?: { model?: string; signal?: AbortSignal },
) => Promise<Uint8Array>; // alpha-matted PNG out

export interface AssetOps {
  store(bytes: Uint8Array, kind: "sprite", mime: "image/png", opts: { ownerId: UserId }): Promise<StoredAsset>;
  /** Read a stored asset's bytes back (the sheet, for slicing). CAS read via hash — the
   *  embed-assets runner precedent (workloads.md runner-env `cas` handle), surfaced as one op. */
  readBytes(assetId: AssetId): Promise<Uint8Array>;
}

export type GetCardOp = (characterId: CharacterId) => Promise<CanonicalCard>; // domain/character (D28 flat row)
```

All wired at `entry/compose`; expressions sideways-imports nothing. `sliceGrid`/`matteFlood` are
NEW `infra/image` ops beside the existing resize/thumbnail transform — pure byte-in/byte-out sharp
work, no db, matching the infra/image charter (assets.md D6). `MatteModelOp` comes from a
DIFFERENT home: `infra/providers` local-light (`createLocalLightMatte(cache)`, §4.1) — it is an
inference op over the shared ONNX model cache, not a sharp transform; compose passes it only when
local-light is configured.

### 3.2 The sheet-prompt compiler (substrate/sheet-prompt.ts — pure)

```ts
export function gridFor(n: number): { cols: number; rows: number }  // n≤4 → n×1; n≤8 → 4×2 (row-major)
export function compileSheetPrompt(p: {
  card: Pick<CanonicalCard, "name" | "description">;
  labels: readonly string[];
  cols: number; rows: number;
  stylePrompt?: string;
}): { prompt: string; negative: string }
```

Prompt intent (the compiled shape, marinara `compileSpritePrompt` modernized):

```
A character expression sprite sheet: a {cols}x{rows} grid of {n} cells, equal-size cells,
thin margins, no gutters, no labels or text.
The SAME character in every cell — identical outfit, hairstyle, framing (upper body,
facing viewer, centered), differing ONLY in facial expression and pose energy.
Character: {name}. {appearance synthesized from card.description, capped 700 chars}
Cell expressions in reading order (left-to-right, top-to-bottom):
cell 1: {label1}; cell 2: {label2}; …; cell {n}: {labelN}.
Plain solid uniform light-gray background (#DDDDDD) in every cell, no scenery, no shadows
on the background. {stylePrompt}
```

Negative (marinara's negative-prompt discipline, sheet-adapted): `"text, letters, captions,
watermark, logo, speech bubble, panel borders, inconsistent character, different characters,
duplicated face across styles, extra limbs, bad anatomy, low quality, background scenery"`.

**The label→cell mapping is positional and row-major** — cell `i` of `sliceGrid`'s output binds to
`labels[i]`. That is the whole contract between prompt and slicer; there is no vision-verification
step in v1 (*rejected: a caption-model cell audit — a second LLM call per cell to defend against a
mis-rendered grid; the user reviews the resulting grid in the management UI and deletes/regenerates
misses — human review is the v1 verifier*).

**WHY `mode:"free"`:** the compiler builds the full literal prompt from the card — imagery's
LLM-extraction two-step (character/face modes) extracts from CHAT context, which this pass doesn't
have and doesn't want. The card IS the identity source, read directly via `getCard`.

### 3.3 The pass (run-sprite-sheet-job.ts)

```
1. card ← getCard(characterId)                                   report 5%
2. {cols, rows} ← gridFor(labels.length)
   {prompt, negative} ← compileSheetPrompt(...)
3. pic ← imagery.generatePicture({ mode:"free", prompt, negative, n:1,
     size: rows === 1 ? "landscape" : "landscape", quiet:true, userId })   report 50%
4. sheet ← assets.readBytes(pic.assetId)
5. cells ← image.sliceGrid(sheet, {cols, rows})                  // throws SheetGenerationError on
                                                                 //   cells.length < labels.length
6. for i in labels: cell ← switch (matte)                        // §4: arm resolved at the verb
     "model" → matteModel(cells[i], { signal })                  // local-light RMBG matte
     "flood" → image.matteFlood(cells[i], { tolerance: 24 })
     "none"  → cells[i]
   stored[i] ← assets.store(cell, "sprite", "image/png", { ownerId })      report 50→90%
   (signal checked between cells — cancel-safe)
7. persistence.batchUpsert(characterId, labels.map((l,i) => ({label:l, assetId:stored[i].id})))
                                                                 report 100%
8. return { written: labels.length, labels, sheetAssetId: pic.assetId, model: pic.model, costUsd: pic.costUsd }
```

## 4. Background removal — DESIGNED, two arms (model preferred, flood fallback)

> **Premise correction (Nate, 2026-07-01, upgrading the original LEAN):** the ONNX runtime is
> ALREADY in the stack — `@huggingface/transformers` powers `local-light`'s rerank cross-encoder
> today (`infra/providers/backends/local-light/rerank.ts`), and doc 02's v2 classify plans the
> GoEmotions ONNX classifier on the same backend. A model matte adds WEIGHTS, not a runtime
> dependency. So `matte:"model"` is a designed, v1-OPTIONAL arm — not a deferred criterion.

**Prompt discipline applies to BOTH arms:** the compiler's solid `#DDDDDD` background instruction
stays (it helps the model matte's edge confidence exactly as it helps the flood).

### 4.1 `matte:"model"` — the local-light matte op (preferred when available)

A background-removal op on the **`local-light` backend, beside embed/rerank/imageEmbed** (the D39
keyless/loopback pattern — in-process, no credential, CPU or CUDA):

- **Binding:** `createLocalLightMatte(cache: LocalLightModelCache): MatteModelOp` — the exact
  `createLocalLightRerank(cache)` shape: a pure transform bound over the shared lazy model cache.
- **Model:** `DEFAULT_MATTE_MODEL = "briaai/RMBG-1.4"` (the canonical transformers.js
  background-removal ONNX model, image-segmentation pipeline; marinara's
  `tryRemoveBackgroundWithBackgroundRemover` is the evidence for the capability, one-line cite),
  overridable via `opts.model` — the `DEFAULT_RERANK_MODEL` precedent.
- **Acquisition/storage:** weights lazy-download through the SAME `LocalLightModelCache`
  mechanics rerank uses (`cacheDir` honored, offline mode = only-cached-weights load; first job
  pays the download, subsequent jobs hit the cache). No new storage system.
- **Shape:** PNG/JPEG bytes in → the pipeline's soft alpha mask is multiplied into the cell →
  alpha-matted PNG bytes out (`MatteModelOp`, §3.1). `signal`-aware (`throwIfAborted`, the
  local-light convention).
- **NOT a `PROVIDER_ROLES` member (LEAN):** v1 binds it at compose as a narrow local-light op
  (the role-clients binder pattern), passed to expressions iff local-light is configured. Flip
  criterion: a SECOND matte backend ever matters (e.g. hosted image-edit-based matting) — then
  the D39 role-add template applies and `matte` becomes a real role. *(Rejected now: minting a
  role with exactly one backend and one consumer — role machinery without a dispatch choice.)*

### 4.2 `matte:"flood"` — the zero-setup fallback

Deterministic corner-flood matte (unchanged): sample the four corner pixels, flood-fill contiguous
pixels within `tolerance` (per-channel distance) to alpha-0 — sharp raw RGBA + a small pure
flood-fill in `@orb/server/kit` (bounded, no weights, works on a deploy with no local-light).
`matte:"none"` keeps the flat background (some art styles look fine framed).

### 4.3 Arm resolution (at the verb, explicit in the workload row)

`generateSpriteSheet` resolves the default: an explicit caller `matte` wins; otherwise **`"model"`
iff the `MatteModelOp` is wired** (compose passes it only when local-light is configured);
otherwise **`"flood"`**. The resolved arm is stamped into the params row (§2) so the job is
reproducible and the run-log shows which matte produced a set. *(Rejected: silent per-cell
fallback model→flood inside the pass — a set with mixed matte quality is worse than an honest
error; a wired-but-crashing matte op fails the job, and the user reruns with `matte:"flood"`.)*

**E4 checkpoint (05 §4):** validates BOTH arms on real provider output — model-matte quality/perf
(CPU latency per cell is the watch item) and flood halo/fringe on anti-aliased `#DDDDDD` edges.
The checkpoint tunes defaults (tolerance, model choice); the design fork is already closed.

## 5. Idempotency + partial failure (the posture)

- **Row writes are ATOMIC-LAST:** `batchUpsert` runs only after ALL cells sliced, matted, and
  stored. A failure at any earlier step writes ZERO sprite rows. **WHY:** a retry regenerates the
  whole sheet (generation is non-deterministic), and a half-written set would mix two generations'
  art styles on one character — worse than nothing. *(Rejected: per-cell incremental upsert with
  resume — resume can't reuse a failed generation's style anyway; the "progress" it saves is
  illusory.)*
- **Orphan blobs are safe by construction:** cells stored before a late failure have `kind:"sprite"`
  rows in `assets` but no `character_sprites` reference — the next `assets:gc` mark-sweep reclaims
  them (grace-windowed; the 01 §4 registry entry is what makes referenced sprites SAFE from that
  same sweep). No compensating deletes in the failure path (assets.md's self-heal-beats-repair).
- **Upsert semantics:** re-running for labels that already have sprites REPLACES those bindings
  (composite-PK upsert) — regeneration is the same verb; the old assets become unreferenced and GC
  reclaims them.
- **Cancel:** the `AbortSignal` is checked between cells; a cancelled job writes zero rows (the
  atomic-last rule) and the engine records `cancelled`.
- **Within-user CAS dedup** (D21) makes byte-identical cells (rare, but `n:1` retries of identical
  prompts can collide) one blob automatically.

## 6. The un-sliced sheet is KEPT

`sheetAssetId` stays in `assets` (kind `"sprite"`), referenced from the workload result row only.
WHY: it is the natural "review what was generated" artifact for the management UI and the raw
material for a future re-slice (a mis-aligned grid can be re-cut without a re-spend). It is
GC-eligible once the workload row is the only reference — acceptable (the result row preserves the
id for forensics even after the blob is swept; a swept sheet just means re-generate).

## 7. Constraints stated honestly

- **Single-active-per-kind (workloads.md invariant 2):** at most ONE `expressions-sprite-sheet` job
  runs deployment-wide; a second character's request while one runs gets `DomainConflictError` and
  the UI surfaces "a sprite job is already running — retry when it finishes." Accepted for v1
  (self-hosted scale; generation is ~1 min). **Criterion to re-scope:** if multi-user deployments
  hit the lock in practice, move the single-active scope to per-`(kind, characterId)` — the
  workloads doc's own deferred criterion mechanism (its embed-corpus/embed-assets discussion names
  the per-(kind,param) evolution).
- **Per-cell resolution is bounded by the provider's max image size** (a 4×2 grid on a 1280×720
  landscape ⇒ ~320×360 cells). Acceptable for a chat-margin stage sprite. **Criterion for an
  `strategy:"individual"` arm** (N separate portrait generations, N× cost, full resolution —
  marinara supported both): user demand for large/HD sprites; the params schema grows an enum then.
- **Tool-capable model NOT required** — this is plain text→image via the `generateImage` role
  (hosted-only, D39); no D48 dependency.

## 8. Test plan (this doc's slice — full plan in 05)

- **Prompt-compiler goldens** (pure): 8-label compile → cell lines in order, cap on appearance
  text, style prompt appended last; 3-label → 3×1 grid line.
- **Grid geometry:** `gridFor` goldens (1→1×1 … 8→4×2); `sliceGrid` on a synthetic 4×2 test PNG →
  8 cells of exact `floor` dimensions, row-major order (pixel-marker corners assert order).
- **Matte:** synthetic cell with solid `#DDDDDD` surround → corners transparent, subject pixels
  untouched; tolerance edge (background ±23 vs ±25).
- **Atomic-last:** injected `assets.store` failure on cell 5 → zero `character_sprites` rows,
  4 orphan asset rows (GC-eligible), workload `failed`.
- **Upsert-replace:** second run over the same labels → same row count, new assetIds.
- **Conflict:** second `start()` while active → `DomainConflictError` surfaced.
- **Runner contract:** `RUNNERS["expressions-sprite-sheet"]` present (exhaustive-dispatch is the
  compile-time pin); params schema round-trips through `StartWorkloadInput`.
