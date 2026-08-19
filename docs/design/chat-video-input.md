---
kind: design
status: active
updated: 2026-08-19
---

# Chat video input (#317) — gif/mp4/webm to the VL model, and finishing the D45 image wire

> Owner intent (verbatim): "we need gif/mp4 to be able to send to the VL model video content" + make
> image-sending "work real nice". Lane: video-input (forge). This doc is the design-of-record; the D45
> ledger row will want a rider (video part member + the completed wire mapping) — orchestrator mint.

## 0. The premise-kill that reframes the whole task

The brief's framing ("chat is image-only today") is GENEROUS. The tree's truth is starker — **chat is
TEXT-only on every wire today**, and the image half of D45 was never finished:

- The domain half IS built: the pipeline gates user attachments on `input.vision`, resolves `asset:` refs
  to data URIs, and emits `{type:"image", url}` `ChatContentPart`s
  (`packages/server/src/domain/chat/engine/pipeline.ts:1035-1047`).
- **Every chat runner then flattens content to text and silently discards the image parts.** The shared
  helper says so in its own header: "Image parts (D45) are wire-mapped per-backend by the translator when
  vision-input is wired; **until then history is text-only**"
  (`packages/server/src/infra/providers/backends/kit/history.ts:1-3`). Consumers: vLLM
  `surfaces/chat.ts:112` (`chatHistoryText`), OR chat-completions `runners/chat/shared.ts:111`, OR
  responses `runners/chat/responses.ts:104`, custom-byo `runners/chat.ts`.
- **The local vLLM connection never even passes the pipeline gate**: the `vllm` capability arm folds on
  reasoning/tools/turns but NO `input` at all (`domain/connection/catalog/resolve-model-capability.ts:387-421`)
  → `input?.vision === true` is false → the owner's Qwen3-VL model gets `image_dropped` on every attach.
- The multimodal machinery that DOES work today is the **summarize/gen seam** (`vllm/engine/chat-completion.ts`,
  OR `index.ts:104-116`, `backends/kit/anth-image-block.ts`) — a different role, not the chat turn.
- Already pre-built and waiting (this repo's futures habit): `ModelCapability.input.video`
  (`contracts/connection/index.ts:153`, "no consumer sends these parts yet"), OR-catalog video synthesis
  (`resolve-model-capability.ts:237`), the engine's video frame sampler
  (`vllm/engine/build-argv.ts:349-356`, fps 4 / max 512 frames, launch-time-only), `MessageMedia`'s video
  arm (`ui/src/content/message-media/message-media.tsx:107-115`), and the OR SDK's typed video parts on
  BOTH endpoints (receipts §3).

So the work is: **finish D45's wire mapping (images), then extend the same seam one part-kind (video),
gate both by capability, and open the client end (picker, preview, render).**

## 1. Content model — reuse the `image` span; the ASSET's mime decides the media kind

**Chosen:** the D51 ref grammar (`![alt](asset:<id>)`) stays the ONE attachment markup; the media KIND is
a property of the stored asset (its `mime` + `animated` byte-facts), read at the two resolve seams (wire:
`entry/compose/resolve-image-ref.ts`; render: the blob-ref resolvers). No new `ContentSpanKind`.

**Rejected — a new `video` span kind.** The tokenizer sees only the ref string and structurally cannot
classify media; a distinguishable grammar (`!video[…](…)`) would be a second markup form the attachment
machinery must mint, models can hallucinate, and ST-import never produces. All five coupled surfaces
(policy row, render projection, wire handler, client filter, member-strip) would duplicate the `image`
row verbatim — a registration carrying zero new policy. The registry row's semantics (`{show, drop}`,
attachment-only resolve-or-drop) are IDENTICAL for video; only its prose widens.

Classification rule (resolve-time, one home):

| Asset | Media kind |
| - | - |
| `video/mp4`, `video/webm` | `video` |
| `image/gif` whose bytes sniff as gif (kit `isAnimated` — which reads EVERY gif as animated, so in practice: every real gif) | `video` — the owner wants motion to reach the model, not a first frame |
| every other `image/*` | `image` |

Animated webp/apng stay `image` (deliberate: no backend advertises them as video containers; deferred).

Build deviation from the first draft (recorded): the classifier reads kit `isAnimated(bytes)` at the
resolve seam — the resolver already holds the full bytes for the data URI, and it is the SAME engine
`assets.store` used to stamp the row's `animated` column — instead of widening `AssetCasRef` with an
`animated` column read (two query shapes + a contract field for a fact already in hand). Kit's gif arm
returns `true` for every gif, so the "still gif → image" row collapsed to "gif → video", which matches the
owner's verbatim ask ("gif/mp4 … video content"); a future kit still-gif detector flows through unchanged.

## 2. Wire part — a new `ChatContentPart` member, not a flag

`@orb/contracts/chat/bus.ts` `ChatContentPart` gains `{ readonly type: "video"; readonly url: string }`.

**Rejected — `{type:"image", media:"video"}` flag.** Per-backend translators dispatch on `type` (§5.5
string-union discipline); a field-flag lets an un-updated translator emit an `image_url` part carrying
video bytes — wire junk on exactly the models that error loudest. D48 set the precedent: a new wire
content class is a new union member (tool-call/tool-result extended this union the same way).

## 3. Backend wire shapes — derived from each backend's REAL accepted types (owner directive)

Receipts read from the installed SDK (`node_modules/.pnpm/@openrouter+sdk@1.1.8/…/esm/models/`):

- **OR chat-completions**: user content is `string | Array<ChatContentItems>` (`chatusermessage.d.ts:14`);
  the union includes `ChatContentImage { type:"image_url", imageUrl:{url, detail?} }`
  (`chatcontentimage.d.ts`) and `ChatContentVideo { type:"video_url", videoUrl:{url} }` with "data: URLs
  supported" (`chatcontentvideo.d.ts`, `chatcontentvideoinput.d.ts:8-11`). Outbound serializer renames to
  `video_url`/`image_url` snake keys.
- **OR responses**: `EasyInputMessage.content` accepts
  `Array<InputText | {type:"input_image", detail, imageUrl?} | InputFile | InputAudio | InputVideo>`
  (`easyinputmessage.d.ts:57-58`); `InputVideo = { type:"input_video", videoUrl: string }` — "A base64
  data URL or remote URL that resolves to a video file" (`inputvideo.d.ts`). `detail` is REQUIRED on
  input_image → send `"auto"`.
- **vLLM chat-completions** (`surfaces/chat.ts` raw wire): OpenAI-compat parts
  `{type:"text"|"image_url"|"video_url", …}` — the same snake shape the gen seam already emits for images
  (`vllm/engine/chat-completion.ts:58`) plus vLLM's documented `video_url` multimodal extension, which the
  engine's launch kwargs (`--mm-processor-kwargs {"fps":…, "max_frames":…}`) exist to sample. Data URIs.
  The shared openai-compat content builder homes in `backends/kit/history.ts` (the sanctioned cross-backend
  seam) and serves vLLM + custom-byo; OR builds its own camelCase SDK shapes in `runners/chat/shared.ts`.
- **agent-sdk**: NO wire mapping (the SDK owns the body; no video anyway on Claude). Pre-existing gap
  flagged, not fixed here: curated Claude models advertise `input.vision:true`, the pipeline emits image
  parts, and the agent-sdk translate flattens them to text — silent. Filed in the lane report.

Text-only turns MUST stay plain-string content on every wire (byte-identical bodies — the prefix caches
and the cache-breakpoint placer both key on string content; `placeHistoryCacheBreakpoint` already skips
array rows, and `rowTokens` already counts array text parts).

## 4. Capability gating — the D45 seam, extended

- The gate stays in the DOMAIN (D45 as amended by D51): the pipeline's `image` wire handler.
- New env facts: `visionOk = input?.vision === true` (existing), `videoOk = input?.video === true` (new).
- Handler order (attachment arm): `!visionOk && !videoOk` → drop WITHOUT resolving (preserves today's
  cheap short-circuit — history re-resolves every turn, and a text-only model must not pay asset I/O per
  turn forever). Otherwise resolve first (the resolver returns the media kind), then kind-gate:
  `video` needs `videoOk`, `image` needs `visionOk`; a failed kind-gate or failed resolve drops with alt.
- `ResolveImageUrlOp` returns `{ url, media: "image" | "video" } | null` (was `string | null`). The
  compose resolver classifies per §1 (it already reads the asset row; `animated` joins `mime`).
  **Rejected:** returning raw mime and classifying in the engine — the animated-gif fact is a stored
  byte-fact of the asset row; the engine would need bytes it doesn't have. Classification is resolve-time
  knowledge with one home.
- New warning code `video_dropped` in `CHAT_WARNING_CODES`; the drop record carries its media kind so
  `imageDropped`/`videoDropped` flags and the `[image: …]`/`[video: …]` placeholders stay precise. The
  client `warningNotice` switch is exhaustive — tsc forces the new copy.
- **vLLM capability arm folds on `input: { vision: true, video: true }`** — D143(c) verbatim posture: the
  descriptor errs PERMISSIVE (per-checkpoint truth is undetectable; the gen slot is a VL checkpoint by
  deployment design — the engine ships a video sampler at launch). A non-VL checkpoint swap makes the
  engine reject the part loudly; hiding the knob is the arm D143 rejects.
- OR: `input.video` already synthesized from advertised `input_modalities` — capability truth, no change.
- custom-byo: `staticProfile` has no `input` ⇒ both gates fail ⇒ no media parts ride. The translator is
  still made total (parts→raw wire) so a future BYO-declared `input` needs no runner change. (BYO
  capability declaration is PD-12 territory; not extended here.)

## 5. Boundary caps (the token-bill fork, resolved)

- Upload byte cap: the existing `/api/assets/upload` route cap applies (64 MiB, `ASSET_UPLOAD_MAX_BYTES`);
  the admin `maxImageBytes` clamp stays image-only (its name is its contract). The client pre-checks
  video files against `caps.assetUpload` and image files against `caps.image` (per-file, before POST).
- Duration: deliberately NOT enforced at the boundary — the server has no decoder (refusing an ffmpeg
  dependency for a cap), and the ENGINE's `max_frames=512` is the real vision-token ceiling (a long clip
  is subsampled, never unbounded). Recorded as the accepted arm; if hosted-OR bills become a problem the
  knob is an AppSettings byte/duration clamp later.
- Magic bytes: `domain/assets/substrate/mime.ts` already verifies mp4 (`ftyp`), webm (EBML), gif (sniff)
  — the video arm's "BG-V only" comment is truth-repaired to name chat attachments too. No new formats.

## 6. Client

1. **Picker**: `AttachImagesItem` → accept `image/*,video/mp4,video/webm`; copy/aria widen to
   "Attach images & video"; `FileDropzone.maxSizeBytes` = `caps.assetUpload` with the per-type pre-check
   (§5) surfacing the same rejection copy the dropzone mints (`oversizeUploadMessage`).
2. **Pending preview**: video attachments get a muted, non-interactive first-frame thumb — a small
   `@orb/ui` arm (the D44 "media needs a ui primitive" law; raw `<video>` in a feature is banned).
3. **Render**: `AssetBlobRef` gains `mime` (contracts + the two resolve verbs + the compose
   `loadChatAssetRefs` join); the row's `AttachmentUrlProvider` map carries `{url, mime}`;
   `MessageMediaBlock`'s asset arm renders `media:"video"` when the resolved mime is `video/*` (gif stays
   `<img>` — native animation). `MessageMedia`/`Lightbox` already carry the video arms.
4. **Warning copy**: `video_dropped` → "This model can't watch videos…" (exhaustive-switch-forced).

## 7. Live-probe receipts (2026-08-19, loopback gen engine :8703, serving `Qwen3.8-27B-heretic-ara-W8A8`)

All three probes PASSED against the live engine — the gif risk is closed, no classification flip needed:

- `video_url` + `data:video/mp4` (a 0.12s 16×16 ffmpeg clip): the engine decoded, frame-sampled, and the
  model answered "Based on the two video frames provided…" — the launch-time `fps`/`max_frames` sampler
  consumed the part end-to-end.
- `video_url` + `data:image/gif` (an animated testsrc gif): decoded and TIMESTAMPED-frame-sampled ("The
  first image is labeled **0.1 seconds**…") — gif-as-motion works verbatim on the video wire.
- `image_url` + `data:image/png` (1px white): "a completely blank, uniform white square" — the image arm
  works on the same checkpoint.

Note: the currently served checkpoint is `Qwen3.8-27B-heretic-ara` (the owner swapped from Qwen3-VL-8B) —
it is natively multimodal, so the D143 errs-open `input:{vision,video}` cell is TRUE for it, live-measured.

## 8. Coupled-site inventory (grep-derived, the shared-value law)

contracts: `chat/bus.ts` (part union + warning tuple) · `assets/index.ts` (`AssetBlobRef.mime`, kind
prose) · `connection/index.ts` (comment truth-repair). server: `connection/catalog/resolve-model-capability.ts`
(vllm input fold) · `chat/contract/context.ts` (op shape) · `chat/engine/pipeline.ts` (env/handler/flags)
· `chat/engine/engine.ts` (emit) · `entry/compose/resolve-image-ref.ts` (+ its chat.ts wiring + the
assets meta op it reads) · `providers/backends/kit/history.ts` (shared content builder; header truth) ·
`vllm/surfaces/chat.ts` · `openrouter/runners/chat/shared.ts` + `responses.ts` · `custom-byo/runners/chat.ts`
· `assets` blob-ref queries/compose join · `assets/substrate/mime.ts` (comment). client: composer +
utility menu + attachment preview · `attachment-url-provider/context` · `message-media-block.tsx` ·
`warning-notice.ts` · upload-cap pre-check. ui: the video-thumb arm. tests (assert the literals):
`tests/server/domain/chat/engine/pipeline.test.ts` · `tests/server/entry/compose/resolve-image-ref.test.ts`
· `tests/server/infra/providers/vllm/surfaces/chat.test.ts` · `…/openrouter/runners/chat/{shared,chat-completions,responses}.test.ts`
· `tests/contracts/chat/*` (part/warning pins) · `tests/client/features/chat/components/composer*.ct.tsx`
· repo-wide grep of `image_dropped` / `type: "image"` / `chatHistoryText` across `tests/`.

## 9. Test plan

- **Red-first (the D45 wire defect, compiles on OLD source):** vLLM `surfaces/chat.test.ts` — a user turn
  carrying `{type:"image", url}` must produce a wire body whose user message content is a parts array with
  an `image_url` member (RED today: flattened to text). Twin red on OR `shared.test.ts`.
- Video emission: pipeline test — video-capable connection + attached video asset ⇒ `{type:"video"}` part;
  planted negative: `input.video` absent ⇒ NO video part + `videoDropped` ⇒ `video_dropped` (the
  clean-refusal control the brief demands). Surface tests: video part ⇒ `video_url` (vLLM raw,
  OR chat-completions camel `videoUrl`, responses `input_video`).
- Byte-stability control: a text-only history produces IDENTICAL body bytes before/after (cache safety).
- Resolver: mp4→video, webm→video, animated gif→video, still gif→image, png→image, foreign/gone→null.
- Composer CT: accept attribute, video pick renders the video preview arm, send carries the file to
  upload with kind `attachment`.
