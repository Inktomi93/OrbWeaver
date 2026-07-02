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
  matte: z.enum(["flood", "none"]),         // resolved (defaulted) at the verb, explicit in the row
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
  /** Corner-sampled flood-fill matte → transparent PNG. Deterministic, no ML (§4). */
  matteFlood(bytes: Uint8Array, opts: { tolerance: number }): Promise<Uint8Array>;
}

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
work, no db, matching the infra/image charter (assets.md D6).

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
6. for i in labels: cell ← matte === "flood"
     ? image.matteFlood(cells[i], { tolerance: 24 }) : cells[i]
   stored[i] ← assets.store(cell, "sprite", "image/png", { ownerId })      report 50→90%
   (signal checked between cells — cancel-safe)
7. persistence.batchUpsert(characterId, labels.map((l,i) => ({label:l, assetId:stored[i].id})))
                                                                 report 100%
8. return { written: labels.length, labels, sheetAssetId: pic.assetId, model: pic.model, costUsd: pic.costUsd }
```

## 4. Background-removal posture — LEAN (flagged; README flag #3)

**v1 DEFAULT: prompt discipline (the solid `#DDDDDD` background instruction) + `matteFlood`** — a
deterministic corner-flood matte: sample the four corner pixels of the cell, flood-fill
contiguous pixels within `tolerance` (per-channel distance) to alpha-0, implemented on sharp's raw
RGBA buffer + a small pure flood-fill in `@orb/server/kit` (bounded, no ML, no new dependency).
`matte:"none"` keeps the flat background (some art styles look fine framed).

**WHY not a real ML background remover in v1:** marinara's
`tryRemoveBackgroundWithBackgroundRemover` leans on an external/ML matte service — a NEW inference
dependency this design refuses to invent as fact (the No-Slop rule; D39's `local-light` today
serves embed/rerank/imageEmbed only, and widening it is a deliberate role-add, not a side effect
of a cosmetics feature). Flood-fill against a prompted solid background is defensible and fully
deterministic. *(Rejected as v1: an ONNX u2net/rembg matte op — right shape if needed, wrong time.)*

**The flip criterion:** if E4 checkpoint testing shows flood mattes producing halo/fringe/holes on
real provider outputs (anti-aliased edges against `#DDDDDD` are the known risk) at a rate the
management-UI review can't absorb, add a `matte:"model"` arm backed by an ONNX matte in the
`local-light` tier — proposed then as its own D39-template amendment, params already carry the
`matte` enum so the contract is ready.

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
