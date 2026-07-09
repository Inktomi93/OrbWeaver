---
kind: spec
status: active
updated: 2026-07-03
---

# 01 — Domain shape & contracts (every shape inline)

> **Status: COMMITTED (D49 item 1) — prescriptive design; the ledger D-entry wins on any conflict.**
> This doc is the single source for imagery's contract surface. Nothing here says "see the code":
> every zod schema, TS interface, verb signature, and injected-op interface an implementer needs is
> inline. Real substrate shapes cited against the built packages as of 2026-07-01
> (`packages/contracts/src/chat/index.ts` block union · `packages/server/src/infra/providers/contract/roles.ts`
> image role · `packages/contracts/src/assets/index.ts` `ASSET_KINDS`).

---

## 1. The 8-slot layout (the committed shape, finalized)

```
domain/imagery/
├── index.ts          FRONT DOOR — re-exports ImageryService (type) + createImageryService +
│                       the contract param/result/error types. Nothing else is importable.
├── service.ts        COMPOSITION ROOT — createImageryService(ctx: ImageryContext). Spreads the
│                       verb factories over one context. Zero logic.
├── context.ts        DI BUNDLE — explicit `export interface ImageryContext` (§2). Never ReturnType<>.
├── contract/
│   ├── service.ts    interface ImageryService (3 public verbs — §3.1)
│   ├── params.ts     GeneratePictureParams · ExtractPromptParams · EditImageParams (§3.2)
│   ├── results.ts    GeneratedPicture · GeneratedPictureImage · ExtractedPrompt · ImageryWarning (§3.3)
│   ├── views.ts      (thin — the render payload IS @orb/contracts/chat MessageContentBlock; no view types)
│   └── errors.ts     ImageryNotConfiguredError · PromptExtractionFailedError ·
│                       GenerationFailedError · ImageEditUnsupportedError (§3.4)
├── verbs/
│   ├── generate-picture.ts   the orchestrator (doc 02 §1)
│   ├── extract-prompt.ts     the two-step, step 1 (doc 02 §2) — PUBLIC
│   ├── caption-avatar.ts     multimodal caption step (doc 02 §3) — INTERNAL (see §3.1 WHY)
│   └── edit-image.ts         explicit edit over an owned asset (doc 02 §4)
├── persistence/
│   └── queries.ts    imagery_generations INSERT + the reuse-lookup SELECT (doc 03 §4) — the ONE writer
└── substrate/
    ├── templates.ts       PROMPT_TEMPLATES + CAPTION_INSTRUCTIONS + DEFAULT_NEGATIVE (doc 02 §5–6)
    ├── mode.ts            mode helpers: isExtractionMode / isPortraitMode / defaultSizeFor(mode)
    ├── size.ts            SIZE_PRESETS (doc 02 §6)
    ├── process-reply.ts   processReply (pure — doc 02 §7)
    └── identity-hash.ts   identityHashFor (pure — doc 03 §4.3)
```

Delta from the committed sketch: `persistence/` is no longer documented-empty (the
`imagery_generations` table — README Review flag 1, argued doc 03 §4); `substrate/` gains
`size.ts` + `identity-hash.ts`. Everything else is the committed layout verbatim.

## 2. `ImageryContext` — the injected-op interfaces (typed here, wired at `entry/compose`)

Imagery sideways-imports NOTHING. Every cross-feature dependency is a declared op type in
`context.ts`; the runtime value is wired at the composition root (`domain-no-cross-feature`).

```ts
// domain/imagery/context.ts
export interface ImageryContext {
  readonly db: Db;                       // imagery_generations only (persistence/ is the sole user)
  readonly clock: Clock;                 // injected — test-determinism gate
  readonly ids: IdMint;                  // typeid mint for imagery_generation rows

  /** connection.resolveRole("generateImage") + the capability descriptor for the resolved model.
   *  ONE call returns both so the edit gate and the request build read the same resolution
   *  (resolving twice could race a settings change mid-verb). */
  readonly resolveGenerateImage: (caller: Principal) => Promise<{
    readonly connection: ResolvedConnection;        // @orb/contracts/connection
    readonly capability: ModelCapability;           // carries input.vision / input.imageEdit (§5)
  }>;

  /** infra/providers generateImage role — the sealed executor. Request/result shapes in §4. */
  readonly generateImage: (req: ImageGenerateRequest) => Promise<ImageGenerateResult>;

  /** The quiet extraction shaper — provided by domain/chat over the `summarize` role (doc 04 §6 Q2).
   *  Chat owns history windowing + macro resolution ({{char}}/{{user}} against ITS MacroContext);
   *  imagery passes the raw mode template. Never persisted as a message; spend attributed to
   *  `caller` as triggeredBy (doc 04 §6 Q1). */
  readonly extractQuiet: (p: {
    readonly caller: Principal;
    readonly chatId: ChatId;
    readonly instruction: string;                   // the mode template, macros unresolved
    readonly subjectCharacterId?: CharacterId;      // focuses {{char}} for group chats
  }) => Promise<{ readonly text: string; readonly costUsd: number | null }>;

  /** The D45/D47-6 vision caption op — the ONE captioner (a §9-reject to duplicate). */
  readonly captionImage: (p: {
    readonly caller: Principal;
    readonly bytes: Uint8Array;
    readonly mime: string;
    readonly instruction: string;
  }) => Promise<{ readonly text: string; readonly costUsd: number | null }>;

  /** assets.store — per-user CAS write (D21). kind is always "generated" from this domain. */
  readonly storeAsset: (
    caller: Principal, bytes: Uint8Array, kind: AssetKind, mime: string,
  ) => Promise<StoredAsset>;

  /** Owner-gated byte read of an existing asset (B3 avatar reference + editImage source).
   *  Provided by assets at compose (fetchOwned gate + CAS read — whether assets grows a
   *  `readOwned` verb or compose pairs getMetadata+cas is the assets owner's call; the TYPE is
   *  dictated here). Throws assets' not-found on non-owned — imagery does not re-gate. */
  readonly readAsset: (
    caller: Principal, assetId: AssetId,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mime: string }>;

  /** character.getCard — avatar lookup (B3) + contentHash (the identity hash, doc 03 §4.3). */
  readonly getCard: (caller: Principal, characterId: CharacterId) => Promise<CharacterCard>;

  /** stats.applyDelta — the generation's economics row (doc 02 §8). */
  readonly recordStats: (delta: TurnEconomicsDelta) => Promise<void>;
}
```

WHY one `resolveGenerateImage` op instead of separate `resolveRole` + `getModelCapability` ops (the
committed table lists only `resolveRole`): the edit gate (doc 03 §1) must read the capability of
the SAME model the request will hit; two ops invite a resolve/read race and a second round-trip.
Rejected: injecting the whole `ConnectionService` (over-broad — the leaf gets exactly the ops it
uses, the narrowed-slice discipline every domain follows).

`transformImage` (sharp) from the committed table is DROPPED from the context: the render path
already thumbnails via `assets.resolveVariant` + `infra/image` (D6/D49 item 2 — built), and
imagery stores originals only. Rejected: keeping an unused optional op (a dead seam; the
`WARNING_CODES`-style "no member without a real call site" discipline applies to DI bundles too).
If a resize-before-store need appears (doc 04 §5 expressions slicing is EXPRESSIONS-side), the op
is a one-line additive re-add.

## 3. The contract surface

### 3.1 `ImageryService` — 3 public verbs

```ts
// domain/imagery/contract/service.ts
export interface ImageryService {
  /** The orchestrator: reuse-gate → prompt resolution (extract | caption | user) → generate →
   *  store → provenance → blocks. Never posts to chat (doc 04 §2). */
  generatePicture(p: GeneratePictureParams): Promise<GeneratedPicture>;
  /** Step 1 standalone — the preview-before-spend surface (review the prompt, then call
   *  generatePicture with it as `prompt`). */
  extractPrompt(p: ExtractPromptParams): Promise<ExtractedPrompt>;
  /** Explicit edit of an existing owned image (instruction + optional mask). Throws
   *  ImageEditUnsupportedError when the resolved model can't edit — see §3.4 WHY. */
  editImage(p: EditImageParams): Promise<GeneratedPicture>;
}
```

`captionAvatar` stays INTERNAL (a verb file, not an interface member). WHY: the only consumer is
`generatePicture`'s multimodal path; a public caption surface would be a second captioner front
door — the committed §9 reject list bans exactly that (standalone caption is D47 item 6, homed on
the vision op). Rejected: exposing it "for symmetry" (a consumer-less API member).

`extractPrompt` public is README Review flag 4.

### 3.2 Params

```ts
// domain/imagery/contract/params.ts
export type SizePreset = "square" | "portrait" | "landscape";
export type ReusePolicy = "prefer" | "never";

export interface GeneratePictureParams {
  readonly caller: Principal;                    // triggeredBy for spend; ownerId for the CAS
  readonly chatId?: ChatId;                      // REQUIRED unless mode==="free" with prompt
  readonly mode: PromptTemplateMode;             // @orb/contracts/imagery — the committed 7-tuple
  readonly prompt?: string;                      // override → skips extraction; REQUIRED for "free"
  readonly negative?: string;                    // appended to DEFAULT_NEGATIVE (doc 02 §6)
  readonly n?: number;                           // 1–4, default 1 (the wire schema's clamp)
  readonly size?: SizePreset;                    // default = defaultSizeFor(mode) (doc 02 §6)
  readonly subjectCharacterId?: CharacterId;     // REQUIRED for character/face + multimodal modes
  readonly useAvatarReference?: boolean;         // B3 (doc 03 §3); default false
  readonly reuse?: ReusePolicy;                  // B2 (doc 03 §4.4); default "prefer" (portrait modes only)
}

export interface ExtractPromptParams {
  readonly caller: Principal;
  readonly chatId: ChatId;
  readonly mode: Exclude<PromptTemplateMode, "free">;   // free has nothing to extract
  readonly subjectCharacterId?: CharacterId;
}

export interface EditImageParams {
  readonly caller: Principal;
  readonly chatId?: ChatId;                      // provenance only
  readonly source: { readonly assetId: AssetId } | { readonly bytes: Uint8Array; readonly mime: string };
  readonly instruction: string;                  // the edit prompt ("make it night", "add a scar")
  readonly mask?: { readonly bytes: Uint8Array; readonly mime: string };  // inpaint region
  readonly n?: number;
  readonly size?: SizePreset;
}
```

Param invariants (enforced by a zod `superRefine` on the wire schema AND re-asserted in the verb —
the parse-at-the-boundary + trust-internal split): `mode === "free"` ⇒ `prompt` required, `chatId`
optional; extraction modes ⇒ `chatId` required; `character|face|*_multimodal` ⇒
`subjectCharacterId` required. WHY `chatId` optional at the DOMAIN params while the committed WIRE
schema (`generatePictureRequestSchema`, `domains/imagery.md` §6.1) requires it: the wire is the
chat-client surface where a chat always exists; the domain params also serve chat-less injectors
(expressions' sprite sheet, rpg's workloads — both call with `mode:"free"` + a composed prompt).
Rejected: two param types (a chat one and a free one) — one type with a refinement beats a
discriminated split that duplicates 9 shared fields.

`EditImageParams.source` takes an **owned asset or uploaded bytes, never a URL** — WHY: a
user-supplied URL is the SSRF surface (doc 04 §7); v1 has no need. Rejected: `url` arm riding
`safeFetch` now (the seam is staged-unwired, `core/Tier-3-Infra.md`; wiring it for a need nobody
has is a dead branch). Criterion to add: the first real remote-image edit ask — the arm then rides
`infra/network` `safeFetch` + `isAllowedImageBuffer`-style validation (Marinara-Residue B5).

### 3.3 Results

```ts
// domain/imagery/contract/results.ts
export interface GeneratedPictureImage {
  readonly assetId: AssetId;
  readonly generationId: ImageryGenerationId;    // the provenance row (doc 03 §4)
  readonly block: MessageContentBlock;           // {kind:"media", media:"image",
                                                 //  src:{kind:"asset", assetId}, alt} — D44, verified
                                                 //  against @orb/contracts/chat messageContentBlockSchema
}

export interface ImageryWarning {
  readonly code: "image_edit_dropped";           // doc 03 §2 — today's only member; a union, not string
  readonly detail: string;
}

export interface GeneratedPicture {
  readonly images: readonly GeneratedPictureImage[];   // length n (≥1); Q5: n blocks, ONE message
  readonly prompt: string;                       // the resolved prompt (regenerate + provenance)
  readonly promptSource: "extracted" | "captioned" | "user";
  readonly mode: PromptTemplateMode;
  readonly model: string;
  readonly costUsd: number | null;               // extraction + caption + generation, summed (doc 02 §8)
  readonly reused: boolean;                      // true ⇒ the reuse gate short-circuited (zero spend)
  readonly warnings: readonly ImageryWarning[];
}

export interface ExtractedPrompt {
  readonly prompt: string;                       // post-processReply
  readonly mode: PromptTemplateMode;
  readonly source: "extracted" | "captioned";
  readonly costUsd: number | null;
}
```

Plural `images` is README Review flag 2 (the Q5 resolution). Warnings ride the RESULT, not a bus
event — WHY: imagery is a sync verb with a direct caller; the caller decides the surface (chat maps
it onto its `warning` ChatEvent, a workload logs it). The runner-level belt still emits the
providers `ResolvedWarning` (doc 03 §2) — defense in depth, one code, two tiers.

### 3.4 Errors

```ts
// domain/imagery/contract/errors.ts — all extend the domain error base
export class ImageryNotConfiguredError extends Error {}     // resolveGenerateImage: no role config
export class PromptExtractionFailedError extends Error {}   // extraction/caption returned empty after processReply
export class GenerationFailedError extends Error {}         // provider returned zero decodable images
export class ImageEditUnsupportedError extends Error {}     // editImage on a model without input.imageEdit
```

The asymmetric edit posture — `generatePicture(useAvatarReference)` **drops with a warning**,
`editImage` **throws** — is deliberate: the reference is an enhancement to a generation the user
still wants; an explicit edit of THIS image silently degraded to an unrelated text→image would
violate least surprise (the model would "edit" by ignoring the source entirely). Rejected: uniform
drop-with-warning (surprising on the edit verb); uniform throw (kills B3's graceful fallback).

> **RIDER STATUS: the I0 contract pair ✓ LANDED 2026-07-09.** `ImageGenerateRequest` gained
> `negativePrompt?`/`size?`/`edit?` (+ the `ImageEditInput` interface) in
> `infra/providers/contract/roles.ts`; `ModelCapability.input` widened to `{ vision, imageEdit? }` in
> `@orb/contracts/connection`. EXCLUDED per the emit-site rule: the `image_edit_dropped` warning code
> (lands with imagery-proper).

## 4. `infra/providers` — the `ImageGenerateRequest` widening (born-compliant, chunk I0)

The built contract today (`contract/roles.ts:85`) is `{ prompt, systemPrompt?, n? }` +
`ImageGenerateResult { images: GeneratedImage[], model, usage: { costUsd } }`. The widening
(committed by D49; `references` is the README-flag-3 addition):

```ts
// infra/providers/contract/roles.ts — ADDITIVE; existing text→image callers unchanged
export interface ImageEditInput {
  /** The primary init image (edit/inpaint subject). bytes → data-URL at the runner; string → URL/data-URL. */
  readonly image: Uint8Array | string;
  /** Inpaint mask (transparent = editable region). Only meaningful with a mask-capable backend. */
  readonly mask?: Uint8Array | string | undefined;
  /** Additional conditioning/reference images (identity consistency). Runners cap per backend
   *  (doc 03 §2.3). rpg-design/08 §2 consumes up to 4 — the field exists because that consumer is law. */
  readonly references?: readonly (Uint8Array | string)[] | undefined;
}

export interface ImageGenerateRequest extends RoleRequestCommon {
  readonly prompt: string;
  readonly systemPrompt?: string | undefined;
  readonly n?: number | undefined;
  // NEW:
  /** Folded into the prompt text by runners whose wire has no native negative field (doc 03 §2.3). */
  readonly negativePrompt?: string | undefined;
  /** A hint, same posture as `n` ("not all providers honor it") — passed where the wire supports it. */
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  /** Present ⇒ img2img/edit; absent ⇒ text→image. Dropped-with-warning by a runner whose model
   *  lacks input.imageEdit (doc 03 §2 — the belt behind the domain gate). */
  readonly edit?: ImageEditInput | undefined;
}
```

## 5. `ModelCapability` — the `input.imageEdit` axis (born-compliant, chunk I0)

The built descriptor (`@orb/contracts/connection`) has `input: { vision: boolean }` optional
(D45). Extend the SAME object:

```ts
// @orb/contracts/connection — the input-modality axis grows one sibling flag
input: z.object({
  vision: z.boolean(),
  /** The model accepts an init/reference image on the image-GENERATION call and transforms it
   *  (gpt-image-1 edits, Gemini image editing). Distinct from `vision` (chat-input images).
   *  Absent ⇒ cannot edit. The GATE for ImageGenerateRequest.edit. */
  imageEdit: z.boolean().optional(),
}).optional(),
```

WHY `input.imageEdit` and not a top-level axis: editing is an input modality — "this model accepts
an image IN on this call" — the exact family D45 created; two input-modality flags in two homes
would fragment the descriptor the panel and runners both read. Rejected: reusing `vision` alone
(a vision chat model ≠ an image-edit model — Claude sees images and edits none); a separate
`ImageEditCapability` type (descriptor fragmentation). Synthesis follows D45's pattern: curated for
known hosted image models, OR metadata/family where published, user-declared for BYO.

## 6. `@orb/contracts/imagery` (born-compliant, chunk I0)

The committed §6.1 shapes verbatim (`PROMPT_TEMPLATE_MODES` 7-tuple, `promptTemplateModeSchema`,
`generatePictureRequestSchema` — not re-printed; `domains/imagery.md` §6.1 is their letter), plus:

```ts
/** Trigger word → mode, for the /imagine surface (client autocomplete AND the automation arm parse
 *  read ONE map — engine-vs-data: helpers are substrate, the DATA is contracts). */
export const MODE_TRIGGERS = {
  you: "character", face: "face", scene: "scenario", background: "background",
} as const satisfies Record<string, PromptTemplateMode>;

export const SIZE_PRESET_NAMES = ["square", "portrait", "landscape"] as const;
export const sizePresetSchema = z.enum(SIZE_PRESET_NAMES);

/** The automation Tier-1 `generate_image` action-arm args (doc 04 §1) — lives HERE so the
 *  automation contract imports it, never re-spells it (no-inline-union-redecl). */
export const generateImageActionArgsSchema = z.object({
  mode: promptTemplateModeSchema.default("scenario"),
  prompt: z.string().max(2000).optional(),
  negative: z.string().max(1000).optional(),
  n: z.number().int().min(1).max(4).default(1),
  size: sizePresetSchema.optional(),
  subjectCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
  useAvatarReference: z.boolean().default(false),
  reuse: z.enum(["prefer", "never"]).default("prefer"),
  quiet: z.boolean().default(false),             // interpreted by the CALLER (doc 04 §2), not imagery
});
export type GenerateImageActionArgs = z.infer<typeof generateImageActionArgsSchema>;
```

ID prefix addition (`@orb/kit/ids`): `imageryGeneration: "imagery_generation"`.
