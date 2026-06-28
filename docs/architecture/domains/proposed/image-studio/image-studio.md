# Orbweaver — `imagery`: chat-facing image generation (prompt-template modes · img2img · `/imagine`)

> **Status: PROPOSAL, not law.** This sketches a home for the GENERATIVE IMAGE cluster (D47 item 1 +
> the §5 gap-register rows). Nothing here is decided until a ledger entry promotes it. The cake, D39
> (hosted-only image-gen), D44/D45 (display vs send), and D46 (automation Tier-1) WIN on any conflict.

---

## 0. Naming — why `imagery`, not `image-studio`

The proposal folder is `image-studio/` (the assigned name), but the **domain** this proposes should be
`domain/imagery`. "studio" reads like a client UI surface; the one-home concept here is a server-side
**orchestration leaf**: "turn chat/character context into a generated image, store it, hand back a render
block." `imagery` names that concern without implying UI. (The `/imagine` command, the settings panel, and
any gallery are *clients* of this domain, not the domain.) Final name is a build-time call; the rest of this
doc uses `imagery`.

This is a **leaf domain** in the §4 8-slot template — NOT a new provider backend, NOT a new credential
source, NOT a chat sub-feature. It sits ATOP three things orbweaver already has: the `generateImage` role
(D39), the `assets` CAS (D21), and the `MessageContentBlock`/`MessageMedia` render model (D44).

---

## 1. What it is + how ST does it

ST's `stable-diffusion` extension (`public/scripts/extensions/stable-diffusion/index.js`, 5998 lines) does
five separable jobs. Only the first three are in scope; the rest are D39-rejected local-backend plumbing.

### 1.1 Prompt-template modes — the LLM extracts the SD prompt, THEN image-gen runs

The core two-step. A "generation mode" picks a **prompt template**; the template is sent to the main LLM as
a *quiet* (non-posted) completion; the LLM's reply becomes the image prompt.

- **The mode enum** — `index.js:113` `generationMode = { TOOL:-2, MESSAGE:-1, CHARACTER:0, USER:1,
  SCENARIO:2, RAW_LAST:3, NOW:4, FACE:5, FREE:6, BACKGROUND:7, *_MULTIMODAL:8-10, FREE_EXTENDED:11 }`.
  Labels at `index.js:136` `modeLabels`. The four the brief names map to: **CHARACTER** ("yourself" — full
  body portrait), **FACE** ("your face" — close-up portrait), **SCENARIO** ("the whole story"),
  **BACKGROUND** (scene/environment).
- **The templates** — `index.js:174` `promptTemplates`. Each is an instruction to the LLM to emit a
  comma-delimited keyword list. E.g. `promptTemplates[FACE]` = *"…provide only a detailed comma-delimited
  list of keywords… facial features and expressions… Prefix your description with 'close up facial
  portrait,'"*; `[CHARACTER]` = the same with "full body portrait,"; `[BACKGROUND]` = *"…location, time of
  day, weather, lighting… Prefix… 'background,'"*. Templates are `{{char}}`/`{{user}}` macro-substituted.
- **Trigger words → mode** — `index.js:152` `triggerWords` (`you`→CHARACTER, `face`→FACE, `scene`→SCENARIO,
  `background`→BACKGROUND, `me`→USER, `last`/`raw_last`→NOW/RAW_LAST). `getGenerationType(prompt)`
  (`index.js:2859`) matches the trigger; anything unmatched is **FREE** (user's literal text is the prompt,
  no LLM extraction).
- **The extraction call** — `getQuietPrompt(mode, trigger)` (`index.js:2982`) `stringFormat`s the template;
  `getPrompt(...)` (`index.js:3165`) dispatches by mode → `generatePrompt(quietPrompt)` (`index.js:3292`)
  which is `generateQuietPrompt({ quietPrompt })` — **a non-streaming main-LLM call that is NOT posted to
  chat**. The reply runs through `processReply` (`index.js:3018` — strip quotes/newlines→commas, NFD
  normalize, alnum+SD-syntax filter). FREE skips extraction; FREE_EXTENDED runs the LLM to *expand* a free
  prompt.
- **Multimodal variants** — `generateMultimodalPrompt` (`index.js:3232`): instead of text extraction, fetch
  the character/user **avatar image** and caption it via a vision model (`getMultimodalCaption`,
  `shared.js`) → the caption is the prompt. (This is the caption capability D47 item 6 / gap §4 names.)
- **Then generate** — `sendGenerationRequest(generationType, prompt, …)` (`index.js:3308`) prepends a
  character-specific prompt prefix (FREE/BACKGROUND/USER skip it), applies type-specific dimensions
  (`setTypeSpecificDimensions` `index.js:3103` — FACE forces portrait, BACKGROUND forces landscape, `snap`
  rounds to a known resolution), calls the backend, and `sendMessage(...)` (`index.js:4966`) posts the
  result as a chat message with `extra.media[]` (`index.js:4988`).
- **Hooks** — `eventSource.emit(SD_PROMPT_PROCESSING, {prompt,…})` (`index.js:3056`) lets extensions rewrite
  the extracted prompt; `FORCE_SET_BACKGROUND` (`index.js:3020`) routes a BACKGROUND result to the wallpaper
  instead of chat; `IMAGE_SWIPED` (`index.js:5931`) regenerates.

### 1.2 img2img / inpaint params

ST exposes `denoising_strength` (`index.js:305`, default 0.7) — the img2img strength knob — plus
init-image/mask handling that lives almost entirely in the **local-backend** request builders (A1111
`index.js:3546`/`3814`/`3938`, ComfyUI workflow `"%denoise%"` substitution `index.js:4239`). The **hosted**
path (`generateOpenAiImage` `index.js:4073`) is text→image + size only; ST's hosted img-EDIT (gpt-image-1
edits / inpaint with a mask) is not wired in this extension. **Takeaway:** ST's img2img/inpaint is a
local-SD feature. On a hosted-only stack the equivalent is **image EDIT** — pass an init image (and
optionally a mask) as an *input image* to an image-capable model (gpt-image-1 edit, Gemini image editing),
which our `generateImage` runner already structurally supports (it sends a chat turn with image modality;
adding an input image part is the same shape as D45's vision input).

### 1.3 The `/imagine` slash surface

`SlashCommand.fromProps({ name:'imagine', aliases:['sd','img','image'], … })` (`index.js:5493`). Callback
runs `generatePicture(initiators.command, args, trigger)`. Named args (`index.js:5530+`): `quiet`,
`negative`, `extend`, `edit` (edit the extracted prompt before gen), `multimodal`, `snap`, `processing`,
`seed`, `width`, `height`, `steps`, `cfg`, `skip`, `model`, `sampler`, `scheduler`, `vae`, `upscaler`,
`denoise`. Most of those (`steps/cfg/sampler/scheduler/vae/upscaler/skip`) are **local-SD knobs** — they do
not survive onto a hosted-only stack. There is also a `GenerateImage` **function-tool** (`index.js:5458`)
the model can call autonomously, using `promptTemplates[TOOL]` as the parameter description.

---

## 2. What neo kept / cut

neo narrowed ST's SD extension **hard**: it kept the **hosted `generateImage` provider role as a
settings-only slot** and cut everything chat-facing.

- **Kept:** `src/server/providers/generate-image.ts` (the role dispatcher — but it *throws*: "no local
  image-gen family ships"), `contract/image-request.ts` (`ImageRequest`/`ImageResult`),
  `image-embed.ts`/`image-embed-request.ts`, the OpenRouter image runner, and the `generateImage` role in
  `user-settings.ts` (OpenRouter-only role config). It is the reserved hosted slot orbweaver inherited and
  finished as D39.
- **Cut entirely:** the `stable-diffusion` extension — no `generatePicture`, no `generationMode`/
  `promptTemplates`, no `/imagine` command, no img2img/denoise, no portrait/face/scenario/background flow,
  no local backends. (Confirmed: `rg generatePicture|imagine|promptTemplates|stable-diffusion` over
  neo `src/` returns only the provider role + docs, never the chat UX.)

So this cluster is a **genuine gap** (gap §5: all four rows ABSENT/RESERVED). The role substrate exists;
the orchestration + UX does not. orbweaver re-adds the *capability* on the clean role, not ST's mechanism.

---

## 3. orbweaver substrate to lean on (do NOT rebuild)

| Need | Existing home | Notes |
|---|---|---|
| text→image generation | `infra/providers` `generateImage` role | `roles/generate-image.ts`; dispatch `firewall.ts:43` `generateImage:["openrouter"]` — **hosted-only (D39)**. Contract `ImageGenerateRequest`/`ImageGenerateResult` (`contract/roles.ts:85`). Runner `backends/openrouter/runners/image/runner.ts` (`runGenerateImage`) sends a chat turn with `modalities:["text","image"]`. |
| role resolution / which model | `domain/connection` `resolveRole("generateImage")` | `verbs/resolve-role.ts:90` — resolves source+model from settings `roleDefaults.generateImage`; **never falls back to local-light** (`:101`). |
| LLM prompt extraction (the quiet call) | `domain/chat` summarize-style shaper + the `chat`/`summarize` role | ST's `generateQuietPrompt` ≡ a non-posted shaped chat call. The summarize role is already "a chat-turn shaper" (`settings/index.ts:253`). Image-prompt extraction is the same: shape a quiet prompt, call the role, take the text. |
| vision caption (multimodal modes) | the vision call in the embeddings indexer (D47 item 6) + D45 vision input | reuse the same image→text path; do not add a 2nd captioner. |
| store the generated bytes | `domain/assets` `store(bytes, kind, mime)` (D21) | per-user CAS, `unique(ownerId,hash)`, `enforceMagic`. **Needs a new `AssetKind` value** — see §7. |
| resize/thumbnail the result | `infra/image` (sharp) | already the variant-transform adapter (D6). |
| display in chat | `@orb/contracts/chat` `MessageContentBlock` `media` block + `MessageMediaSrc{kind:"asset"}` (D44) | `chat/index.ts:761`. A generated image is a `media`/`image`/`asset` block — the render contract already exists. |
| send the result back to a vision model (optional) | D45 `ChatHistoryMessage.content` content-parts | one asset, two contracts (display ⇆ client, send ⇆ model). |
| `/imagine` + autonomous "tool" generation | `domain/automation` Tier-1 (D46) | D46 §5.1 already lists **"trigger a generation"** as a closed-action-union member (the gated one, §5.3). `/imagine` is an automation action, NOT a bespoke command engine. The model-initiated `GenerateImage` tool maps to the D47 item-2 agent-sdk tool loop calling the same front door. |

---

## 4. Proposed home in the cake

### 4.1 The leaf — `packages/server/src/domain/imagery/` (8-slot template)

```
domain/imagery/
├── index.ts            FRONT DOOR — ImageryService (interface) + createImageryService
├── service.ts          COMPOSITION ROOT — wires verbs + injected cross-feature ops. Zero logic.
├── context.ts          DI BUNDLE — explicit `interface ImageryContext` (not ReturnType<>):
│                         { resolveRole, generateImage, extractPrompt, captionImage,
│                           storeAsset, transformImage?, clock }  (all INJECTED at entry/compose)
├── contract/
│   ├── service.ts      interface ImageryService — the authoritative verb list
│   ├── params.ts       GeneratePictureParams · ExtractPromptParams · EditImageParams
│   ├── results.ts      GeneratedPicture (assetId + the MessageMedia-ready block + provenance)
│   ├── views.ts        (thin — the result IS a contracts MessageContentBlock)
│   └── errors.ts       ImageryNotConfiguredError · PromptExtractionFailedError · GenerationFailedError
├── verbs/
│   ├── generate-picture.ts   the orchestrator: mode→template→extract→generate→store→block
│   ├── extract-prompt.ts     mode-template → quiet LLM call → processReply  (the §1.1 two-step, step 1)
│   ├── caption-avatar.ts     multimodal modes: avatar bytes → vision caption → prompt
│   └── edit-image.ts         img2img/edit: init image (+mask?) → generateImage(edit) → store  (§1.2)
├── persistence/        (NONE — imagery owns no table; documented-empty slot, like assets' errors)
└── substrate/
    ├── templates.ts          PROMPT_TEMPLATES keyed by PromptTemplateMode (the ST templates, modernized)
    ├── mode.ts               PromptTemplateMode union helpers (FREE detection, trigger→mode)
    └── process-reply.ts      processReply (pure: strip/normalize the LLM's keyword list)
```

**Why a leaf and not part of `chat`:** the flow is cross-feature by construction — it needs the `chat`
role (extract), the `generateImage` role (generate), and `assets` (store). chat is already the biggest
domain; folding image orchestration in violates one-home and makes chat reach into providers+assets for a
side concern. A leaf that **injects** all three at the composition root keeps `domain-no-cross-feature`
true. It mirrors how summarize/translate are "shapers over a role," and how `assets` orchestrates
infra+db without owning either.

**Why server, not client:** the prompt extraction is a privileged LLM call against the user's resolved
credential; the generation hits a hosted provider; the bytes must land in the per-user CAS with
`enforceMagic`. All of that is server. The client only renders the resulting `MessageContentBlock` and
offers the compose-time controls.

### 4.2 Contracts package — `@orb/contracts/imagery`

The cross-boundary surface (client picks a mode; server validates):
- `PROMPT_TEMPLATE_MODES` tuple + `promptTemplateModeSchema` + `PromptTemplateMode` (§7.5 one-home union).
- `generatePictureRequestSchema` (the tRPC input — mode, optional override prompt, negative, n, size).
- The result is a `MessageContentBlock` (`media`/`asset`) — already in `@orb/contracts/chat`; imagery
  re-exports the ready block, it does not redeclare a media shape.

### 4.3 infra/providers — widen `ImageGenerateRequest` (born-compliant, §7)

Add img2img/edit + sizing fields to the existing `ImageGenerateRequest` (`contract/roles.ts:85`). See §6.

### 4.4 Client surface (Phase 6)

- A compose-time "generate image" control + mode picker (CHARACTER/FACE/SCENARIO/BACKGROUND/FREE).
- The `/imagine` command — registered as an **automation Tier-1 action** invocation (D46), not a new
  command engine. Args reduce to the hosted-relevant set: `mode`, `negative`, `prompt` (override/`edit`),
  `n`, `size`, `quiet`. The local-SD knobs (`steps/cfg/sampler/scheduler/vae/upscaler/skip/denoise-as-SD`)
  are **dropped** — they have no hosted meaning (D39).
- Render: the existing `MessageMedia` component (D44) — no new render path.

### 4.5 Db tables

**None.** Generated images are `assets` rows (per-user CAS). The chat message that carries them is a
`chat`/`message_variants` row with a `MessageContentBlock[]` body (D44). Imagery is pure orchestration —
its `persistence/` slot is documented-empty (same precedent as `assets`' empty `errors.ts`).

### 4.6 Ownership category

No new owned entity → no new ownership rule. The generated asset is **single-owned** (`assets.ownerId`,
D21); the chat message is **membership-scoped** (`chatId` + `chat_participants`, the chat category). Both
categories are pre-existing; imagery introduces neither.

---

## 5. Cross-feature composition (injection model)

All wired at `entry/compose` — imagery sideways-imports nothing.

| Op injected | Provided by | Used for |
|---|---|---|
| `resolveRole("generateImage")` | `domain/connection` | resolve hosted source+model for generation |
| `generateImage(req)` | `infra/providers` (down) | the text→image / edit call |
| `extractPrompt(quietPrompt, ctx)` | `domain/chat` (the summarize-style shaper) | the LLM keyword-list extraction (FREE skips) |
| `captionImage(bytes, instruction)` | the vision/caption op (D47 item 6 / D45) | multimodal modes |
| `assets.store(bytes, kind, mime)` | `domain/assets` | persist generated bytes to the per-user CAS |
| `transformImage` (optional) | `infra/image` (sharp) | thumbnail/resize the result |

**Consumers of imagery (none import its internals — front door / injection only):**
- `domain/chat` (or the turn pipeline) injects `imagery.generatePicture` so a turn can attach a generated
  image; the autonomous `GenerateImage` model-tool (D47 item 2) dispatches to the same front door.
- `domain/automation` Tier-1 "trigger a generation" action (D46 §5.3) calls `imagery.generatePicture` via
  the injected front door — this is `/imagine` and rule-driven generation, one path.

---

## 6. Contract shapes (sketch)

### 6.1 The prompt-template mode union (`@orb/contracts/imagery`)

```ts
// One home (§7.5). FREE = user text is the prompt (no LLM extraction); the four template modes
// extract via the LLM; the *_MULTIMODAL variants caption the avatar instead. ST's TOOL/MESSAGE/
// NOW/RAW_LAST/USER are foldable: keep the ones with hosted meaning.
export const PROMPT_TEMPLATE_MODES = [
  "free", "character", "face", "scenario", "background",
  "character_multimodal", "face_multimodal",
] as const;
export const promptTemplateModeSchema = z.enum(PROMPT_TEMPLATE_MODES);
export type PromptTemplateMode = z.infer<typeof promptTemplateModeSchema>;

export const generatePictureRequestSchema = z.object({
  chatId: typeIdSchema(ID_PREFIX.chat),
  mode: promptTemplateModeSchema,
  prompt: z.string().optional(),        // override / post-`edit` prompt; required when mode==="free"
  negative: z.string().optional(),
  n: z.number().int().min(1).max(4).optional(),
  size: z.enum(["square", "portrait", "landscape"]).optional(), // hosted-meaningful only; NOT raw WxH knobs
  quiet: z.boolean().optional(),        // don't post to chat, just return the block
});
export type GeneratePictureRequest = z.infer<typeof generatePictureRequestSchema>;
```

Templates live in the **domain** (`substrate/templates.ts`), keyed by `PromptTemplateMode`, exhaustively
(a `Record<PromptTemplateMode, string>` → a new mode fails `tsc`, the §7.5 `exhaustive-dispatch` gate).
They are macro-substituted via `kit/macro` (`{{char}}`/`{{user}}`), not ST's `stringFormat`.

### 6.2 `ImageGenerateRequest` widening (img2img/edit — `infra/providers/contract/roles.ts`)

```ts
// A single input image for hosted EDIT (gpt-image-1 edits / Gemini image editing). Bytes or a URL —
// NOT a filesystem path (that was the local tier's job; runner header FLAG). Mirrors D45's vision input.
export interface ImageEditInput {
  readonly image: Uint8Array | string;        // bytes → data-URL; string → URL/data-URL (runner toImageUrl)
  readonly mask?: Uint8Array | string | undefined; // inpaint mask (transparent = edit region)
}

export interface ImageGenerateRequest extends RoleRequestCommon {
  readonly prompt: string;
  readonly systemPrompt?: string | undefined;
  readonly n?: number | undefined;
  // NEW (additive, optional — text-only callers unchanged):
  readonly negativePrompt?: string | undefined;
  readonly size?: { readonly width: number; readonly height: number } | undefined;
  readonly edit?: ImageEditInput | undefined;  // present ⇒ img2img/inpaint; absent ⇒ text→image
}
```

The OpenRouter runner (`runGenerateImage`) already builds a chat turn; `edit` becomes an extra
`image_url` content part on the user message (the exact shape `imageContent()` already produces for
imageEmbed). **Hosted-only stays true** — a model/backend that can't edit drops `edit` with a `warning`
ChatEvent (the D45 `image_dropped` precedent), never a hard throw.

### 6.3 The verb signature (`ImageryService`)

```ts
export interface ImageryService {
  // The orchestrator: mode→template→extract(LLM)→generate(role)→store(asset)→MessageContentBlock
  generatePicture(p: GeneratePictureParams): Promise<GeneratedPicture>;
  // img2img / inpaint over an existing asset (or uploaded init image)
  editImage(p: EditImageParams): Promise<GeneratedPicture>;
}

export interface GeneratedPicture {
  readonly assetId: AssetId;
  readonly block: MessageContentBlock;   // {kind:"media", media:"image", src:{kind:"asset",assetId}, …}
  readonly prompt: string;               // the resolved prompt (provenance / "regenerate")
  readonly model: string;
  readonly costUsd: number | null;
}
```

`GeneratePictureParams` carries the `Principal` (for `resolveRole` + `assets.ownerId`) and the
`GeneratePictureRequest`.

---

## 7. Born-compliant-before-Phase-5 bits

Phase order is kit → contracts → db → server → client. Two things are **cross-cutting wire** and must land
in the contracts/providers passes (retrofitting them after chat is built whole is the exact pain the
"spec it first" discipline exists to prevent — same rule as D44/D45):

1. **`ImageGenerateRequest` widening (§6.2)** — `negativePrompt`/`size`/`edit`. The sealed OpenRouter image
   runner + the role dispatcher are already built (Phase 4b); widening the request *after* is a translator
   retrofit. Additive + optional ⇒ zero break to existing text→image callers. **MUST land in the providers
   contract pass.**
2. **A generated-image `AssetKind`** — `ASSET_KINDS = ["card","avatar","export"]`
   (`@orb/contracts/assets:28`) has no value for a chat-generated image. Add `"generated"` (or `"image"`).
   The db `assets.kind` enum derives from the same tuple (§7.5) — adding it later is a schema change to a
   born-compliant table, so **add it in the contracts/db pass** even though the *consumer* is Phase 5.
   *(Cross-check the assets domain owner: D-entry deferred `"export"` as scaffolded intent; this is the same
   class of additive kind.)*
3. **`PROMPT_TEMPLATE_MODES` + `generatePictureRequestSchema`** (`@orb/contracts/imagery`) — pure additive
   contracts; can land with the contracts pass or alongside the domain. Low risk either way.

**Pure Phase-5/6 (no born-compliant pressure):** the `domain/imagery` leaf itself (verbs/templates/
orchestration), the chat-turn wiring, the automation "trigger a generation" action arm, the `/imagine`
client command, the compose-time mode picker, the render (reuses `MessageMedia`).

---

## 8. Difficulty + sequencing + open questions

**Difficulty: MODERATE** (matches gap §5). No new backend, no new credential source, no new table, no new
render path — it is orchestration over four existing seams + two small additive contract changes. The cost
is concentrated in (a) the extract→generate two-step correctness and (b) the img2img request widening
touching a sealed translator.

**Sequencing:**
1. Contracts/providers pass: widen `ImageGenerateRequest` (§6.2), add the `AssetKind`, add
   `@orb/contracts/imagery` (§6.1). *(born-compliant — do with the other D44/D45 contract work.)*
2. Phase 5: build `domain/imagery` (the leaf), wire it into the chat turn + the automation action.
3. Phase 6: the client mode picker + `/imagine` + compose controls (render is free via `MessageMedia`).

Depends on: `assets` (4c, in flight), `infra/image` (4b, present), `infra/providers` generateImage (done),
`domain/chat` (Phase 5), `domain/automation` (D46, Phase 5), the D45 caption op (for multimodal modes).

**Constitution-fighting things to REJECT:**
- **Local SD backends** (A1111/ComfyUI/Horde/sdcpp/drawthings) — D39 made image-gen hosted-only on
  purpose; each is a new credential SOURCE that re-opens the providers firewall. ST's `denoising_strength`/
  `steps`/`cfg`/`sampler`/`scheduler`/`vae`/`upscaler` knobs die with them. Inpaint/img2img survives ONLY
  as hosted image-EDIT (§6.2).
- **A bespoke command engine for `/imagine`** — D46 says slash/actions ARE automation actions. `/imagine`
  is one closed-action-union member, not a parallel command system.
- **ST's `extra.media` mutable-array message model** — orbweaver uses the typed `MessageContentBlock`
  union (D44); a generated image is a `media` block, never a stringly `extra.media` push + `inline_image`
  boolean.
- **A second captioner** for multimodal modes — reuse the D45/D47 vision op.

**Open questions (need a decision before build):**
1. **Quiet-extraction provenance.** ST's `generateQuietPrompt` is a hidden, non-persisted LLM call. Does
   the extraction turn count against the chat's budget/attribution axis (D17/D46)? Proposed default: yes —
   it's a real spend; bill it to the initiating principal, but don't persist it as a visible message.
2. **Does the extraction reuse the `chat` role or a dedicated `summarize`-style shaper?** ST uses the main
   chat model. Proposed default: a shaper over the **summarize** role config (it's already "a chat-turn
   shaper," `settings/index.ts:253`) so users can point prompt-extraction at a cheap model independently.
   Flag for the connection/settings owner.
3. **Hosted img-EDIT model availability.** §6.2 assumes the resolved `generateImage` model supports image
   input/editing (gpt-image-1, Gemini image). Need a `ModelCapability` axis (like D45's `vision`) to gate
   `edit` vs drop-with-warning. **Reuse/extend D45's capability work** rather than invent a parallel axis.
4. **BACKGROUND mode's destination.** ST routes BACKGROUND to the wallpaper (`FORCE_SET_BACKGROUND`).
   orbweaver has no per-chat background concept (gap §6 lists backgrounds/BGM as OUT). Proposed default:
   BACKGROUND generates and posts as a normal media block; no wallpaper feature unless separately greenlit.
5. **The `n` (`message_variants`?) for multiple images.** Generating `n>1` → one message with `n` media
   blocks, or `n` swipe variants? Proposed default: `n` media blocks in one message (the D44 model already
   carries a block array); swipe-regenerate is a separate, later concern.

---

## 9. Cross-refs

- **D39** — `generateImage` is the 5th role, hosted-only; local SD rejected. (`tiers/providers.md`,
  `firewall.ts:43`.)
- **D44** — `MessageContentBlock`/`MessageMedia` render model (the display home for a generated image).
  (`client.md §12`, `contracts/chat/index.ts:761`.)
- **D45** — image INPUT / `ModelCapability.vision` axis + content-parts send model (reuse for img-EDIT
  gating + multimodal caption).
- **D46** — automation Tier-1: `/imagine` and rule-driven generation are the "trigger a generation"
  closed-action-union member. (`proposals/scripting-automation-extensibility.md §5`.)
- **D47** — image generation IN CHAT is committed (item 1); standalone caption (item 6) is the multimodal
  captioner this leans on. (`reports/sillytavern-feature-gap.md §5`.)
- **D21** — assets are per-user single-owned; the generated bytes land in the per-user CAS.
  (`domains/assets.md`.)
- Related domains: `domains/assets.md` (store/CAS), `domains/character.md` (`getCard` for `{{char}}` in
  templates), `domains/connection.md` (`resolveRole`), `proposals/scripting-automation-extensibility.md`
  (the action surface), `client.md §12` (render + compose).
</content>
</invoke>
