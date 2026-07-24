---
kind: spec
status: realized
updated: 2026-07-20
---

# ComfyUI-Control Integration — driving the owner's `orbgen` kit from orbweaver's imagery arm

> **REALIZED + GRADUATED (2026-07-20 — D105).** The whole program is BUILT across `4c6a1314` /
> `d95855ea` / `5e74cfce` / `005c5e4f` / `b620d065`: the native TS graph-builder engine (36 goldens,
> all four arches, byte-canonical vs the Python oracle), availability, the pose track, the BYO track,
> owner-scoped + sweep-classified + GC-wired + composed-real-tested. PROBED-BYTES: the C0 re-probe
> (2026-07-19, ok-with-models, 8 checkpoints) LIFTED MA-8's UNPROBED-bytes caveat — all three txt2img
> arches produced live magic-verified bytes; the pre-graduation UNPROBED headers are superseded.
>
> **AS-BUILT NOW-REALIZED (previously flagged, since built):** the F3-residual client quality toggle
> IS built (`quality:"high"` → `mode:"advanced"`; `quality-control.tsx` in the Advanced disclosure,
> `qualityArg`, `b620d065`); the N1 BYO edit-capability seam IS built — a saved workflow's
> placeholder-derived capability now folds into the connection-level `ModelCapability`
> (`applyByoWorkflowCapability`, resolve-model-capability §4.11.2c, `b620d065`), so BYO edit
> placeholders have a production producer; the F1 narrator-post origin loop was also stamped closed.
>
> **RECORDED deferrals / follow-up chips (LOW; honest runtime everywhere):**
>
> - **F4** (§4.4/C5/§4.12.4b) — lever availability grounds NODE CLASSES only (+ the flux Fill UNET);
>   controlnet/adapter/detector model FILES + family-baked LoRA files are NOT grounded against the
>   live catalog — a missing file surfaces as a typed generation-time execution error, not a
>   picker-time refusal. (The `loras` list is a browse surface, ungrounded by design.)
> - **F5** (§4.12.2/C6c) — the DWPose photo→skeleton extract is DEFERRED (import stores bytes as-is;
>   a photo imported as a "skeleton" feeds ControlNet unpreprocessed) — follow-up chip.
> - **F6** (C7) — the two ST-style seed workflows are NOT shipped; the library starts empty.
> - **F7** (§4.11.2) — `injectComfyuiValues` auto-bind fallback for placeholder-less BYO graphs is a
>   coded seam with zero runtime callers; the placeholder path is the only shipped path.
> - **F8** (§4.3) — "size → nearest kit bucket" snapping does not exist; presets forward verbatim (an
>   SDXL portrait runs 1024×1536 off-bucket) — sub-optimal, never an error.
>
> Code + file headers + tests ARE the doc; this file is a frozen historical record — its disposition
> lives in [`../proposed/INDEX.md`](../proposed/INDEX.md). Graduation gate met per D84: fresh Opus stickler
> READY-TO-GRADUATE (`reports/stickler/2026-07-20-comfyui-control-graduation-audit.md`); scoped
> suites 361/361. On any conflict `Core-Path-Registry.md` D96/D105 win. The PROPOSED/DESIGN-FIRST
> banner below is superseded.

> **Status: PROPOSED design — DESIGN-FIRST, nothing built.** This spec is the integration architecture for
> making the owner's curated ComfyUI control kit (`/home/inktomi/inktomi-stack/comfyui-control`, the `orbgen`
> Python package) first-class in orbweaver's `generateImage` arm, alongside a FIRST-CLASS BYO custom-workflow
> track (§4.11, modeled on SillyTavern + marinara), WITHOUT coupling imagery features to the local arm. It
> NARROWS/EXTENDS D96 (the ComfyUI source) and consumes the graduated `history/imagery-design/` +
> `history/expressions-design/` seams. **Two peer tracks, one pipeline:** curated `orbgen:<role>` modes (§4.1)
> and `byo:<workflow>` custom workflows (§4.11) share the `model`-slot selection channel + the driving arm and
> never fork capability. A **pose library + picker track** (§4.12 — the kit's \~669-skeleton OpenPose set as a
> curated library + BYO pose import + a virtualized picker) rides both as a capability-honest OPTIONAL ControlNet
> lever.
>
> **THE FORK IS RULED (owner, 2026-07-19): option (b') — a NATIVE TYPESCRIPT graph-builder engine inside the
> sealed `backends/comfyui/` arm; NO Python sidecar.** Owner's words: *"we can do complex logic in ts, we do it
> right and we do it once."* The TS engine becomes THE canonical home of curated graph-building; the Python
> `orbgen` kit is DEMOTED to the reference implementation it was ported from (prototyping ground + parity oracle,
> not a living peer — no twin, no drift, because there is only ONE home). §4.1 records the ruling + the two
> rejected options. The build plan (§7) is sized honestly against the port cost (\~3k LOC of engine logic,
> chunked); parity goldens against the Python kit's emitted graphs are the port's executable proof (§4.10).

## 0. Orientation — what was read (self-counted)

- **The kit** (`comfyui-control/`): **843 files total** = 780 proof PNGs (`gallery/`, regenerable, not source) +
  669 pose-skeleton PNGs are counted inside a `poses/library/` subtree of those 780… corrected: **780 PNG** (
  `gallery/` proofs + `poses/` skeletons) + **63 non-image** = 31 Python source `.py` + 26 `.pyc` caches + 3
  JSON data + 2 Markdown docs + 1 `.gitignore`. Every one of the 31 `.py` source files, both `.md`, all 3 JSON
  (structure + samples), and the pose index were read IN FULL. Models are NOT in the repo — they live on the
  host at `/media/inktomi/Data/comfyui/basedir/models/` (→ `/basedir/models/` in the `comfyui` container).
- **The orbweaver arm**: `AGENTS.md` (constitution, full), ledger D96 + D100, the graduated `imagery-design/`
  (6 files, full) + `expressions-design/` (README + sprite-sheet doc, full), the sealed
  `infra/providers/backends/comfyui/` arm (all 6 files), the connection routing (`deriveRunner`,
  `backendForSource`, `getModelsForSource` comfyui arm, `probeComfyui`), the `@orb/contracts/imagery` +
  `@orb/contracts/connection` (comfyui probe/catalog + `ModelCapability.imageGen`) + `@orb/contracts/credentials`
  (`comfyui` source) contracts.

## 1. The kit — what `orbgen` is and does end-to-end

`orbgen` is a headless, dependency-light Python control package that drives the SAME owner ComfyUI instance
orbweaver targets (localhost:8188, container `comfyui` on `inktomi-net`), over the SAME HTTP workflow API
(`POST /prompt` → poll `/history/{id}` → `GET /view`). It emits **native ComfyUI API-format graphs** — a flat
`{ "<nodeId>": { "class_type": str, "inputs": {...} } }` dict — which is BYTE-FOR-BYTE the shape orbweaver's
`isComfyuiGraph` already validates and `submitPrompt` already POSTs. The kit is, in effect, a vastly richer
"workflow-template + parameter-injection" engine than orbweaver's single static template.

### 1.1 The three-layer registry (the kit's spine)

- **FAMILIES** (`families.py`) — one frozen descriptor per model holding ALL of that model's arch intricacies:
  the graph builder (`arch` ∈ `sdxl | flux | anima | anima_edit`), guide-exact sampling (sampler/cfg/steps/
  clip-skip/vpred), prompt scaffolds (quality/negative), and *method tags* the capability layer branches on
  (`controlnet` ∈ `union_promax | flux_union_pro2 | anima_lllite`; `inpaint` ∈ `diffdiff | flux_fill | lanpaint`;
  `img2img` ∈ `vae_encode | flux_latent | qwen_edit`). 8 families: `noobai_eps`, `noobai_vpred`, `anima_turbo`,
  `anima_hq`, `anima_edit`, `flux`, `lustify`, `pony_real`.
- **ROLES** (`roles.py`) — use-case → family + overrides (the flex layer; reassigning an engine is a one-line
  edit). 13 roles: `anime_sfw`, `anime_nsfw`, `anime_quality`, `anime_variety[_hq]`, `edit`, `realistic_sfw`,
  `realistic_fast`, `realistic_hires`, `realistic_nsfw[_flux|_pony]`, `realistic_edit`.
- **CAPABILITIES** (`capabilities/`) — generic ops that branch on the DESCRIPTOR, never a model name:
  `generate` (txt2img / img2img / inpaint / controlnet-pose), `generate_best_of` (N-candidate + VLM/PickScore
  judge), `sprite_sheet` + `expression_pack`, `character_asset`, `pose` (library + DWPose extract), `vision`
  (caption / auto-mask / bg-remove).

### 1.2 The capability × family matrix (all live-tested by the owner)

| | txt2img | img2img | inpaint | pose/controlnet | identity lock | edit |
| - | - | - | - | - | - | - |
| NoobAI EPS / V-Pred (sdxl) | ✓ | ✓ | ✓ DiffDiff | ✓ union-promax | ✓ IPAdapter FaceID | — |
| Lustify / Pony (sdxl) | ✓ | ✓ | ✓ DiffDiff | ✓ union-promax | ✓ IPAdapter FaceID | — |
| FLUX (flux) | ✓ | ✓ latent | ✓ FLUX-Fill | ✓ Union-Pro-2.0 | ✓ PuLID-Flux | ✓ Kontext + Redux |
| Anima (qwen) | ✓ | ✓ edit-graph | ✓ LanPaint | ✓ Anima-LLLite | — | ✓ instruction-edit |

Higher-order capabilities compose `generate()`: **best-of-N** (one batched candidate gen → judge → winner
refine; honest "unscored" arm when no judge backend is reachable — the same hosted+local-honest posture
orbweaver's `plan-for-small-hardware` doctrine demands), **sprite sheets** + **expression packs** (28 SillyTavern
emotions via face-inpaint identity lock, upper-face mask clamping, RMBG matte, deterministic PIL grid paste),
**character assets** (party\_icon / sprite / portrait / avatar / roster), the **\~670-skeleton pose library** (13
categories incl. NSFW), **DWPose** extraction, a **136-LoRA catalog** with lazy Civitai auto-download + trigger
injection, a per-engine **prompt compiler** (danbooru / danbooru\_real / anima / natural dialects), and a sourced
**prompt guide** (`guide_for(role)` — the UI money-shot).

### 1.3 Models expected / present

The kit references specific files by name in `config.py` (checkpoints: NoobAI EPS/V-Pred, Lustify GGWP V7, Pony
Realism V2.2, FLUX.1-dev / Fill / Kontext / Redux, Anima turbo/aesthetic/base/edit; controlnets: xinsir union-
promax, Shakker FLUX Union-Pro-2.0, Anima-LLLite; adapters: IPAdapter FaceID Plus v2, PuLID-Flux; detectors:
face/hand/eyes YOLO, EraX NSFW, ntd11 segm, SAM; upscalers: 4x-UltraSharpV2, RealESRGAN-anime; \~136 LoRAs). It
needs \~15 custom nodes documented in `CONTAINER.md` (Impact-Pack, IPAdapter\_plus, controlnet\_aux, UltimateSD-
Upscale, LanPaint, RMBG, Detail-Daemon, RES4LYF, KJNodes, …). Per D96 the owner's docker had ZERO checkpoints
at orbweaver's build-time probe (the `ok-but-empty` state); the owner now states models are present and the
"comfy shit is up." **Model/node presence is therefore a RUNTIME fact to detect honestly, never a static
assumption** (§4.4).

### 1.4 Invocation conventions (the transport orbweaver already speaks)

`client.py` is pure stdlib: `queue_prompt(graph) → prompt_id`, `wait_for(id)` polls `/history`, `output_images`
reads `outputs[].images`, `fetch_image` GETs `/view?filename&subfolder&type`, `upload_image` POSTs
`/upload/image` (multipart) for init/reference images, `free()` releases VRAM. Every graph is API-format JSON.
**This is the identical wire contract orbweaver's `runner.ts` already implements** — the difference is entirely
in graph CONSTRUCTION, not transport.

## 2. The current orbweaver arm — the seams that exist today

D96 landed a **sealed `infra/providers/backends/comfyui/` arm** serving `generateImage` ONLY (keyless, owner-
configured `COMFYUI_BASE_URL`, egress via `safeFetch` with the H1 owner-configured-endpoint posture). Its
current capability is deliberately minimal:

- **`workflow.ts`** — ONE hardcoded 9-node txt2img template (`DEFAULT_COMFY_WORKFLOW_JSON`:
  CheckpointLoaderSimple → 2× CLIPTextEncode → EmptyLatentImage → KSampler → VAEDecode → SaveImage), plus
  `isComfyuiGraph` (BYO validator), `findNodeByClass`/`linkTargetId` (BYO node targeting), and
  `parseComfyuiObjectInfo` (live `/object_info` → `{samplers, schedulers, checkpoints, vaes}` catalog).
- **`request.ts`** — TWO injection paths already coded: (1) `buildDefaultComfyuiGraph` = `%placeholder%`
  substitution over the default template (the ONLY path the runner calls today); (2) `injectComfyuiValues` =
  node-class + link targeting into a **BYO API-format graph** (find the KSampler anchor, follow its
  positive/negative/latent\_image/model links). Path 2 is a coded SEAM with **no runtime caller and no contract
  channel** — the user-facing BYO import affordance is explicitly "post-rollout."
- **`runner.ts`** — the async orchestration (`/prompt`→`/history`→`/view`, bounded 120s poll, abort→`/interrupt`,
  magic-sniffed bytes). Text→image only: an `edit` payload is dropped-with-warning (`image_edit_dropped`).
- **`response.ts`** — `/history` parse + magic-byte mediaType sniff (PNG/JPEG/WEBP/GIF).
- **`index.ts`** — the sealed factory + `probeComfyuiObjectInfo` (the tri-state `ok-with-models` /
  `ok-but-empty` / `engine-off`, D83).

Routing: `comfyui` is a `CredentialSource` (keyless `ComfyuiCredential`), a `GENERATE_IMAGE_SOURCES` member,
routed by `backendForSource("comfyui") → "comfyui"`; every chat/derive pairing fail-closes in `deriveRunner`.
The diffusion-params thread is **`imageDiffusionParamsSchema`** (`steps`/`cfg`/`sampler`/`scheduler`/`seed`,
`@orb/contracts/imagery`) → `GeneratePictureRequest.params` → the domain request → the runner's `resolveValues`.
`ModelCapability.imageGen` advertises `{steps, cfg, sampler, scheduler, seed, checkpoint}` booleans (the panel
offers only what the capability advertises). The connection `model` slot IS the checkpoint filename;
`getModelsForSource` returns `needs-probe` (the client probes `/object_info` on picker open, no free text).

**The gap in one sentence:** orbweaver can drive exactly ONE fixed-shape txt2img recipe with 5 scalar knobs; the
kit can drive 13 roles across 4 archs with LoRA stacks, controlnet pose, identity lock, inpaint, img2img, edit,
detailer chains, upscale, best-of-N, sprites, and expression packs — and orbweaver's request vocabulary has no
channel to select or parameterize any of it.

## 3. The three binding requirements (owner-stated)

1. **USE THE KIT FULLY** — the curated `orbgen` workflows/models become first-class in orbweaver's ComfyUI
   backend: generation, img2img, upscaling, expressions, pose, identity, inpaint, edit — whatever the kit covers,
   the imagery pipeline can drive.
2. **BYO CUSTOM WORKFLOWS ARE A FIRST-CLASS TRACK** — a user imports ANY ComfyUI API-format workflow JSON,
   declares/binds placeholders, and the app substitutes its vocabulary at generation time. Bar (owner,
   2026-07-19): **the ST + marinara pattern** — *"we definitely need to allow for custom workflows to be put in;
   SillyTavern and marinara both do this already, we can model after them a bit — but I also wanted to make my
   own modes too."* Two truths held together: (a) the ComfyUI ENDPOINT is already a BYO / owner-configured
   endpoint — structurally identical to `vllm` / `custom_openai` — so the endpoint side is existing posture, not
   new construction; (b) the **saved-workflow-with-placeholder-binding SURFACE is a first-class TRACK built to
   the ST/marinara bar** — multiple named workflows, a placeholder editor, a per-generation picker (§4.11). The
   two tracks (curated `orbgen:<role>` and `byo:<workflow>`) share the selection channel + the driving arm and
   NEVER fork the pipeline. The owner's "my own modes too" = the curated `orbgen` roles ARE those modes.
3. **HOSTED/OTHER PROVIDERS STAY FIRST-CLASS** — ComfyUI (curated or BYO) is ONE arm among the hosted diffusion
   options (OpenRouter image models, Venice). Nothing couples imagery features to the local arm; capability
   refusal stays honest per `plan-for-small-hardware` (a real local arm or a VISIBLE refusal, never a silent
   degrade).

## 4. The integration architecture

### 4.1 THE RULED SHAPE — a native TypeScript graph-builder engine (owner, 2026-07-19)

The kit's power is **conditional graph construction**: a variable-length LoRA loader chain, arch-specific node
wiring, a UNET swap to FLUX-Fill when a mask is present, detailer chains toggled by flags, pose-controlnet
routing that differs per family, v-prediction patch ordering. A static `%placeholder%` template CANNOT express
"add N LoRA nodes" or "swap the checkpoint loader for a UNET loader." So requirement 1 forces a decision on
where the graph-building lives. The owner **ruled (b'): port the kit's builder logic to a native TypeScript
engine inside the sealed `backends/comfyui/` arm** — *"we can do complex logic in ts, we do it right and we do
it once."*

**Why (b') dissolves the twin-rot objection.** A naive port would fork one concept into two living homes (the
banned drift). The ruling avoids that by DEMOTING the Python kit: the TS engine becomes THE canonical home of
curated graph-building; `orbgen` is the **reference implementation it was ported from** — a prototyping ground
and a parity oracle (§4.10), not a living peer. There is ONE home, so there is no twin and no drift. "Do it
once" is the whole point: the TS engine is written right, and the Python is frozen evidence of what to write.

**Why the port is smaller than its LOC suggests.** The \~3138 LOC of Python is NOT 3138 LOC of hard translation.
The kit is (owner's framing) *"just calls to my comfyui container, no different than our complex vllm setups"* —
there is **no Python-specific machinery to translate**: no native deps, no async magic, no runtime the port must
recreate. The kit is graph-assembly logic + HTTP-to-the-container, and **orbweaver ALREADY OWNS the
container-driving half**: MA-8/D96 built the sealed `backends/comfyui/` runner (`/prompt`→`/history`→`/view`,
`safeFetch`, magic-sniff), which is the same in-house pattern as the vLLM backend arm + the local-inference
engine supervisor (a local inference container driven by an owner-owned TS arm). So the port is the **BUILDER
logic ONLY** — the `families`/`roles`/`graphs`/`capabilities` graph-assembly layer becomes TS; the driving
layer, egress, assets, and provenance are already orbweaver's and stay so. Any lingering "keep the Python for
X" residue dies: the container-call layer orbweaver already owns supersedes the kit's `client.py` wholesale.

**The two rejected options (recorded with why):**

- **(a) Static captured templates.** Capture the kit's proven graphs as a registry of named API-format JSON
  templates (fixed-shape graph + `%placeholder%` slots + required-model manifest). **Rejected: amputates the
  kit's parametric power** — a static template cannot express variable LoRA stacks, arch swaps, detailer toggles,
  or best-of, so "use the kit FULLY" (requirement 1) fails. *(It survives as a FREE downstream bonus — §4.10:
  because the TS engine EMITS API-format graphs, any curated invocation can be CAPTURED to a static template for
  a kit-less/frozen-snapshot tier later. Future chip, not built now.)*
- **(c) Kit-as-graph-builder sidecar** (a thin Python HTTP facade that returns graphs; orbweaver drives them).
  **Rejected by owner: TS is the house language and the kit should not remain a live external dependency.** A
  sidecar keeps the Python alive as a running service orbweaver depends on — the opposite of "do it once in the
  house language"; it also adds a deployment surface (a second owner-configured endpoint) for no capability the
  native engine lacks.

Everything below §4.2–§4.10 is written against (b'). **The honest cost:** the builder port is \~3k LOC of engine
logic (guide-exact sampler/cfg/clip-skip/vpred ordering + the arch/method-tag branching) — sized and chunked in
§7 because the owner chose right-once over cheap; parity goldens (§4.10) are what make the port trustworthy.

### 4.2 Where curated workflows/roles live (contract-side, arm-side)

A "curated workflow" is a **kit ROLE** (`anime_sfw`, `realistic_nsfw`, …) ported into the TS engine, plus its
per-call knobs. The selection vocabulary must reach the sealed arm without leaking graph JSON into the domain
(D96). The seam:

- **A curated-workflow REGISTRY, arm-internal.** The sealed arm holds the list of curated role ids + their
  human labels + their required model/node manifests — the TS `ROLES`/`FAMILIES` registry ported from
  `orbgen.roles`/`orbgen.families` (+ the `guide_for` projection for the prompt-guide hint). This is the ComfyUI
  analogue of a model catalog — it never leaves `backends/comfyui/`; the domain sees only opaque selection ids.
- **The connection `model` slot carries the selection.** The cleanest fit for the existing seam: a comfyui
  connection's `model` is either a **raw checkpoint filename** (drives the existing default/BYO path — BYO and
  bare-checkpoint stay first-class) OR a **curated role id** (namespaced, e.g. `orbgen:realistic_nsfw`). The
  `probeComfyui`/`getModelsForSource` picker lists BOTH: raw checkpoints from `/object_info` AND curated roles
  from the TS engine registry, each with its live availability (§4.4). **This keeps the domain request
  UNCHANGED** — `req.model` already flows end-to-end; the arm interprets the namespace. Alternative rejected:
  adding a `workflow`/`template` field to `imageDiffusionParams` — it would push ComfyUI-specific vocabulary up
  into the shared imagery wire, which the hosted arms don't share (a descriptor-fragmentation smell; the
  `model`-slot overload keeps the wire arm-agnostic).

### 4.3 Parameter mapping onto the existing diffusion-params thread

The existing `imageDiffusionParamsSchema` (`steps`/`cfg`/`sampler`/`scheduler`/`seed`) maps 1:1 onto the kit's
per-call `generate()` kwargs — the arm forwards them into the TS engine's build call. The kit's RICHER levers
(LoRA slugs, `pose=`, `identity_image=`, `quality`/`fast`/`mode`, `kind`, `n`/`batch`, `negative`) map onto
existing orbweaver request fields where they already exist and onto **capability-gated additions** where they
don't:

| Kit lever | orbweaver channel | Notes |
| - | - | - |
| prompt / negative | `req.prompt` / `req.negativePrompt` (LANDED I0 wire) | negative already threads to the runner |
| steps/cfg/sampler/scheduler/seed | `imageDiffusionParams` (LANDED) | already advertised by `imageGen` capability |
| size | `req.size` → nearest kit bucket | the arm snaps semantic presets to the family's guide buckets |
| n / batch | `req.n` (1..4, LANDED) | the kit runs native ComfyUI batch (one seed, per-index noise) |
| identity\_image / pose / img2img source | `req.edit.{image,references,mask}` (LANDED I0 wire) | §4.6 — the edit seam is the natural home for reference/init/mask images |
| role selection | `req.model` namespace (§4.2) | curated role vs raw checkpoint |
| LoRA slugs, quality tier, `kind` | curated-role DEFAULTS + a bounded arm-internal knob set | NOT surfaced to the shared wire in v1 (kept arm-internal to avoid ComfyUI vocab leaking up); a future `imageGen` capability extension can advertise a curated-knob subset |

The capability descriptor is the honesty contract: `ModelCapability.imageGen` per curated role advertises which
knobs that role's family actually honors (Euler-only families don't advertise a sampler picker; FLUX advertises
guidance-as-cfg). The panel offers ONLY advertised knobs — the existing capability-truth posture, extended per
role via the ported `guide_for` projection.

### 4.4 Model/node presence detection — honest capability surfacing

The kit references specific model + custom-node filenames; the owner's instance may or may not have each. The
`plan-for-small-hardware` doctrine (a real arm or a VISIBLE refusal, never silent degrade) drives detection:

- **Reachability + catalog** already exist: `probeComfyuiObjectInfo` → the tri-state + the live
  `{samplers,schedulers,checkpoints,vaes}`. Extend it to also read the registered **node classes** from
  `/object_info` (the keys of the reply) so a curated role's required custom nodes (e.g. `LoraLoaderModelOnly`,
  `ControlNetLoader`, `UltralyticsDetectorProvider`) can be checked present.
- **Per-curated-role availability.** Each curated role carries a manifest (required checkpoint/UNET, controlnet,
  adapter, detectors, custom-node classes). The arm resolves a role's availability = all required files present
  in the live catalog AND all required node classes registered. A role missing any dependency renders in the
  picker as a **disabled/refusing option with the reason** ("realistic\_nsfw needs `lustifyNSFWCheckpoint_ggwpV7`
  - the Impact-Pack nodes — not installed"), never silently substituted.
- **No builder-liveness state.** The TS engine is IN-PROCESS (no sidecar to be up or down — the (c)-rejection
  dividend), so the honest states reduce to the existing tri-state (`ok-with-models` / `ok-but-empty` /
  `engine-off`) refined by per-role model/node availability. A curated role is available iff its manifest
  resolves against the live catalog; otherwise it refuses visibly. There is no new failure mode to surface.
- **The `ok-but-empty` state stays first-class** (D96/D83) — a reachable engine with zero checkpoints refuses
  every generation honestly.

### 4.5 The selection UX → contract implications

- **Three peer values on ONE `model`-slot selection:** `orbgen:<role>` (curated mode), a **raw checkpoint
  filename** (drive the default template on that checkpoint), or `byo:<workflow>` (a saved custom workflow —
  §4.11). All three share the capability surface, the request vocabulary, and the driving arm; none forks the
  pipeline. The BYO track is FIRST-CLASS (the full ST/marinara bar — §4.11), not a preserved seam.
- **The curated picker** lists roles with the ported `guide_for` metadata (the prompt-style hint, the LoRAs a
  role attaches) — a genuine UX upgrade the engine computes from the ported registry.
- **Expressions + character assets** (§5) surface THROUGH imagery selection, not as a new domain seam.

### 4.6 The edit / reference / pose seam

The I0-landed `ImageGenerateRequest.edit { image, mask, references[] }` (gated by `ModelCapability.input.imageEdit`)
is the exact channel the kit's `identity_image=` / `image=` / `pose=` / `mask=` levers need. Mapping:

- **img2img** → `edit.image` (the init image) + a denoise knob (curated-role default).
- **inpaint** → `edit.image` + `edit.mask`; the kit auto-selects the family-correct method (FLUX-Fill / DiffDiff
  / LanPaint) — orbweaver just forwards, the kit decides.
- **identity lock** → `edit.references[]` (the face ref); the kit routes to IPAdapter-FaceID (sdxl) or PuLID
  (flux). This is EXACTLY the B3 avatar-reference-conditioning consumer (`useAvatarReference`) the imagery design
  already commits — the kit makes B3 real on the local arm.
- **pose** → a reference image in `edit.references[]` tagged as a control image, OR a curated-role pose-library
  selection (arm-internal knob). The \~670-skeleton library is an arm-internal asset the engine references.

The arm must UPLOAD these init/reference/mask images to ComfyUI (`POST /upload/image`) before building the graph
— a new arm-internal step (the kit's `_server_image` is the reference implementation). This is the one place the
sealed arm gains an egress the current text→image path lacks; it rides the same `safeFetch`/host-pin posture.

For **hosted arms, `edit` behavior is UNCHANGED** — this is purely the ComfyUI arm learning to honor a payload it
currently drops-with-warning. `imageEdit` capability = true for curated roles whose family supports it, false
otherwise (the honest refusal for, e.g., a plain-txt2img role).

### 4.7 Expressions + sprite sheets — the second integration surface

The kit's `expression_pack` (28 ST emotions, face-inpaint identity lock, upper-face mask clamp, RMBG matte) and
`sprite_sheet` are a MUCH more sophisticated implementation of what `domain/expressions` already builds
(`expressions-sprite-sheet` workload → `imagery.generatePicture` → grid-slice → matte → `character_sprites`). Per
the graduated expressions design, expressions consumes `imagery.generatePicture` by INJECTION and owns the sprite
rows; imagery owns the generation. So the kit's expression power surfaces the SAME way — **through imagery's
front door, selected as a curated role/mode** — never as expressions calling the kit directly (the leaf
discipline holds). Two concrete wins the kit unlocks for the existing expressions seam:

- **`matte:"model"`** (the RMBG local-light arm the expressions design commits) is exactly the kit's
  `remove_background` (RMBG-2.0). If ComfyUI is the local-light matte home, expressions' matte model arm
  and imagery's ComfyUI arm share one RMBG path.
- **Per-expression identity lock** (the kit's face-inpaint approach) is a higher-fidelity alternative to the
  grid-slice sprite sheet — a candidate curated mode. This is a DESIGN CHOICE for the owner (§8), not assumed.

### 4.8 Best-of-N + the judge

The kit's `generate_best_of` (N candidates → VLM/PickScore judge → winner) is a quality lever with an HONEST
unscored arm (ships the first candidate + says `scored:false` when no judge backend is reachable) — directly
compatible with `plan-for-small-hardware`. It is a curated-role/knob concern, arm-internal; the judge's VLM
endpoint is the owner's local Qwen3-VL (the same honest-arm posture). NOT v1-critical; flagged as a later chunk.

### 4.9 What stays UNCHANGED (the non-coupling guarantee — requirement 3)

- The shared imagery wire (`generatePictureRequestSchema`, `imageDiffusionParamsSchema`) stays arm-agnostic — no
  ComfyUI vocabulary climbs into it. The `model`-slot namespace (§4.2) is the ONLY selection channel and it is
  already arm-agnostic (every source picks a model).
- `domain/imagery`, `domain/expressions`, `domain/chat` are untouched — they inject `generateImage` and know
  nothing of curated roles, sidecars, or graphs.
- Hosted arms (OpenRouter image, Venice) are untouched; a user with no ComfyUI sees honest refusal on ComfyUI-
  only selections and full function on hosted ones.
- D96's seal holds: the graph JSON never leaves `backends/comfyui/` — and under (b') it never even reaches a
  network hop to build (the engine is in-process), a strictly TIGHTER seal than a sidecar would have been.

### 4.10 Parity goldens — the port's executable proof (binding)

A full-fidelity port is only trustworthy if it provably emits the SAME graphs the reference kit does. The proof
is a **parity-golden suite**, binding on every builder chunk:

- **Capture the oracle.** Run the Python kit's builders over a matrix of representative inputs — **every arch
  (`sdxl` / `flux` / `anima` / `anima_edit`) × key knob combinations** (bare txt2img; +LoRA stack; +controlnet
  pose; +identity/reference; img2img; inpaint→the FLUX-Fill/DiffDiff/LanPaint method swap; +detailer chain;
  +hires/upscale; v-pred ordering; batch) — and freeze each emitted API-format graph as a fixture.
- **The TS engine must match.** Each fixture is a golden: the TS builder, given the same input, emits a
  STRUCTURALLY-EQUIVALENT graph (same node classes, same link topology, same injected knob values — node-id
  labels may differ if the comparison canonicalizes them). A mismatch is a port regression, caught forever.
- **The graph goldens are the executable contract; the 780 proof PNGs are evidence, not tests.** The PNGs show
  what the reference PRODUCED (useful for a human eyeballing a live PROBED-bytes run); the graph fixtures are
  what the CI asserts.
- **`isComfyuiGraph` is an internal self-check.** Every graph the engine emits passes the existing
  `isComfyuiGraph` gate before it is POSTed to ComfyUI — a malformed build is a typed refusal, never a
  passthrough. (This holds for the reference-captured fixtures too — a captured oracle graph that fails the gate
  is a capture bug, flagged at fixture time.)
- **BONUS PATH (future chip, not built now):** because the engine EMITS API-format graphs, any curated
  invocation can be CAPTURED to a static template (rejected option (a)'s form) — giving kit-less / frozen-
  snapshot deployments a curated tier for free later. Note it; do not build it.

### 4.11 The BYO custom-workflow track (ST/marinara-modeled — first-class, requirement 2)

**Studied references (read IN FULL):** SillyTavern's ComfyUI integration
(`references/sillytavern/public/scripts/extensions/stable-diffusion/index.js` — `generateComfyImageCommon`
line 4221, the workflow-editor `onComfyOpenWorkflowEditorClick` line 4764, the workflow CRUD
`onComfyNew/Delete/RenameWorkflowClick`, `comfyWorkflowEditor.html`, the seed workflows
`Default_Comfy_Workflow.json` / `Char_Avatar_Comfy_Workflow.json`) and marinara
(`references/marinara-engine/packages/server/src/services/image/runpod-comfyui.service.ts` —
`generateRunPodComfyUI` substitution + reference-image binding). The pattern below is modeled on BOTH; every
element cites which reference it comes from.

#### 4.11.1 What the references do (the proven bar)

- **Multiple SAVED NAMED workflows, managed** (ST): a workflow is a named file; the UI is full CRUD — New /
  Open-editor / Delete / Rename (`onComfyNew/Delete/RenameWorkflowClick`), listed in a picker
  (`loadComfyWorkflows` → a dropdown, `onComfyWorkflowChange`). ST ships two seeds (a default txt2img +
  `Char_Avatar_Comfy_Workflow` — an img2img/reference workflow). Marinara stores ONE workflow per CONNECTION
  (`comfyui_workflow` field) — per-connection scope rather than a global library.
- **A workflow EDITOR with a placeholder panel** (ST, `comfyWorkflowEditor.html` + editor JS): a textarea for
  the raw API-format JSON (the hint tells the user to paste the "Save (API Format)" export and replace values
  with placeholders) + a placeholder list showing a BUILT-IN set (`%prompt%`, `%negative_prompt%`, `%model%`,
  `%vae%`, `%sampler%`, `%scheduler%`, `%steps%`, `%scale%`, `%denoise%`, `%clip_skip%`, `%width%`, `%height%`,
  `%user_avatar%`, `%char_avatar%`, `%seed%`) with a **live FOUND / NOT-FOUND indicator** (`checkPlaceholders`
  searches the workflow text for `"%key%"` and toggles a not-found class per placeholder as the user types).
- **Custom placeholders** (ST, `comfy_placeholders: [{find, replace}]`): user-declared find→replace pairs where
  `replace` is macro-expanded (`substituteParams` — resolves `{{char}}` etc). The mechanism for binding
  ARBITRARY graph inputs to app vocabulary.
- **Generation-time STRING substitution** (both, `generateComfyImageCommon` / `generateRunPodComfyUI`): over the
  workflow STRING, replace each `"%token%"` — numeric tokens (`"%steps%"`) swap the whole quoted token for a
  bare number; string tokens (`%prompt%`) swap the bare token inside the template quotes for a JSON-escaped
  value (`escapeJsonStr` / `JSON.stringify`) — THEN `JSON.parse`; invalid JSON after substitution is a typed
  error. **This is byte-identical to orbweaver's already-landed `buildDefaultComfyuiGraph`** — orbweaver's
  default template IS the ST `Default_Comfy_Workflow.json` shape (D96 cites it).
- **Reference/init IMAGE placeholders** (marinara, `%reference_image_01%`..`%reference_image_NN%` up to 4 +
  `%reference_image%` for the first; ST `%user_avatar%` / `%char_avatar%`): image inputs bind as base64, with a
  **1×1 PNG placeholder** (`RUNPOD_COMFYUI_PLACEHOLDER_REFERENCE_BASE64` / ST's `PNG_PIXEL`) substituted when the
  reference is MISSING so the graph stays valid. This is exactly the edit-seam (§4.6) reference-image binding.
- **Validation UX**: the live not-found indicator per placeholder; a reachability ping; save/parse errors
  surfaced. Marinara hard-errors when no workflow is supplied ("paste your ComfyUI workflow (API format)").

#### 4.11.2 The orbweaver BYO track (modeled on the above, homed to orbweaver's law)

- **Multiple saved named workflows PER USER** (ST's library model, NOT marinara's one-per-connection — the owner
  said "multiple SAVED named workflows, not one"). A workflow = `{ name, graphJson }` stored owner-scoped. The
  natural home is a per-user store the sealed arm reads and the domain never sees (D96) — likely a small
  owner-scoped table (`comfyui_workflows`) or a settings-namespace blob; **the storage home is an open shape
  question (§8), not decided here** — it must satisfy owner-scope + GC-invisibility of the JSON to the domain.
- **The placeholder-binding vocabulary IS the existing diffusion-params thread** (requirement 2): the built-in
  placeholder set maps 1:1 onto orbweaver's LANDED vocabulary — `%prompt%` / `%negative_prompt%`
  (`req.prompt` / `req.negativePrompt`), `%seed%` / `%steps%` / `%cfg%` / `%sampler%` / `%scheduler%`
  (`imageDiffusionParams`), `%width%` / `%height%` (`req.size`), `%model%` (the checkpoint), `%denoise%` /
  `%clip_skip%` (curated-knob extensions, §C8). Image inputs bind from the EDIT SEAM (§4.6):
  `%reference_image_NN%` / `%init_image%` / `%mask%` ← `req.edit.{references,image,mask}`, base64, with the 1×1
  PNG fallback when absent (marinara's exact posture). Custom find→replace pairs cover anything the built-ins
  don't. **No new shared-wire vocabulary is invented** — the BYO track binds the SAME request fields the curated
  track and the hosted arms already carry.
- **The substitution engine reuses `buildDefaultComfyuiGraph`'s proven mechanics** (numeric-token vs
  string-token substitution, `isComfyuiGraph` self-check after parse — already in `request.ts`), generalized
  from ONE hardcoded template to the selected saved workflow's stored JSON. orbweaver's node-targeting
  `injectComfyuiValues` stays as an OPTIONAL auto-bind convenience (find the KSampler, wire the obvious knobs)
  for a user who pasted a graph without hand-placing placeholders — a fallback, not the primary path; the
  ST/marinara placeholder model is primary because the user declares intent explicitly.
- **HONEST per-workflow capability = the found/not-found set** (requirement 2's "declares no mask input ⇒
  doesn't offer inpaint"): the arm scans a saved workflow's JSON for which `%placeholder%` tokens it contains
  and derives that workflow's `ModelCapability.imageGen` + `input.imageEdit` from EXACTLY that set. A workflow
  with no `%mask%` token advertises no inpaint and the panel doesn't offer it — never a silent drop. This is the
  BYO analogue of the curated per-role manifest (§4.4): the placeholder set IS the capability declaration. The
  live found/not-found indicator (ST) is the client surface of the same fact.
- **A per-generation workflow PICKER** on the same `model`-slot channel (§4.5): `byo:<workflow-name>` is the
  third peer value; `getModelsForSource`/the picker lists the user's saved workflows alongside curated roles +
  raw checkpoints, each with its derived capability.
- **The editor UX** ports ST's affordances (cited): a JSON textarea with the "Save (API Format)" paste hint, the
  built-in placeholder panel with the live found/not-found indicator (placeholder DISCOVERY), custom find/replace
  rows, workflow New/Rename/Delete, and save-time JSON validation (`isComfyuiGraph` — refuse a non-graph
  honestly, marinara's hard-error posture). This is CLIENT + a thin transport surface (§8 sweep-classification).

#### 4.11.3 What orbweaver keeps that the references don't (the non-negotiables)

The references substitute and POST directly; orbweaver's BYO track still rides the FULL orbweaver spine —
`safeFetch` host-pinned egress (marinara uses its own `safeFetch`; ST goes through its server), the async
`/prompt`→`/history`→`/view` runner (D96, already built), magic-byte mediaType sniff (both references sniff
too — marinara's `detectKnownImageMimeType` is the same posture), CAS `"generated"` store, `imagery_generations`
provenance, stats deltas, and the reuse gate. The BYO track changes ONLY graph CONSTRUCTION (a stored workflow +
placeholder substitution instead of the default template or the curated engine); everything downstream is the
shared imagery pipeline. Curated and BYO converge at the drive step.

### 4.12 The pose library + picker track (ControlNet OpenPose — optional, capability-honest)

Owner (2026-07-19): *"we need to make a pose picker to pick from our pose library and allow for a pose library
to be imported or added — the controlnet openpose thing is a pretty cool optional thing."* Pose is a
per-generation OPTIONAL lever: an OpenPose skeleton drives ControlNet only when the user picks one. Curated
poses (the kit's set) and BYO poses (user uploads) browse in ONE picker, badged by source.

#### 4.12.1 The curated pose library (from the kit's own index — don't re-invent the taxonomy)

The kit ships **669 library skeletons in 13 categories** (`poses/index.json`, read in full) + 5 canned presets
(`standing`/`sitting`/`action`/`kneeling`/`lying`). The taxonomy is DERIVED from the kit's index verbatim (the
categories ARE the taxonomy): `nsfw_standing` (164), `lewd` (101), `nsfw_sitting` (76), `group` (74),
`nsfw_suspended` (41), `lying` (40), `nsfw_lying` (38), `nsfw_squatting` (36), `nsfw_kneeling` (33),
`nsfw_split_leg` (30), `action` (19), `nsfw_all_fours` (12), `metalstocks` (5). Each entry is a ready OpenPose
skeleton PNG (already a control map — no DWPose extraction needed; the kit's `_resolve_pose` returns
`is_map=True` for these). Many categories are explicitly adult — the same NSFW-gating question as curated roles
(§8 Q3) applies to the pose picker's default visibility.

**Shape (per house rules — curated is GLOBAL, not per-user):** curated skeletons are shipped/synced app assets
with a GENERATED index — the theme-pipeline precedent (`theme-pipeline-d71`: seed value-sets generated, seeds
render static). The \~669 PNGs ship as a packaged pose set served by the client dist (static, cache-friendly);
the index (`{ id, category, name, thumbnailSrc, orientation }`) is a generated registry the picker reads. Curated
poses are NOT per-user CAS rows (D21 is per-user; these are global) — they are app-shipped content like the theme
JSONs. WHY not seed 669 rows into every user's CAS: global content in a per-user store is the exact doubling D20/
D23 ban; a shipped static set + generated index is the theme precedent and GC-invisible by construction.

#### 4.12.2 BYO pose import (owner-scoped, rides assets — the OwnedTable class ruling)

Users add their own poses/libraries: upload skeleton (or plain photo → DWPose-extracted) images, singly or as a
**batch import**. Per the directive + the assets law: poses ride the **per-user CAS + an owner-scoped registry
row**, NOT a parallel blob store — the `character_sprites` / `imagery_generations` precedent
(`domain/assets/persistence/asset-refs.ts` carries both as retaining refs).

- **A new `"pose"` AssetKind** (born-compliant addition to `ASSET_KINDS`, exactly as `sprite`/`background`/
  `document` were added; the db CHECK derives from the tuple, D34). Bytes land in the per-user CAS,
  **magic-byte sniffed at store** (`enforceMagic` — the assets law; the same posture the ComfyUI runner already
  applies to output bytes).
- **An owner-scoped `pose_library` registry row** — `{ id, assetId → assets.id (CASCADE), name, category, tags,
  orientation, source: "byo", createdAt }`, NO `ownerId` column (ownership derives via `assetId → assets.ownerId`
  — the D20 pattern `imagery_generations` uses). Its `assetId` is a **registered retaining ref** in
  `asset-refs.ts` (the GC obligation — a new asset-bearing column without a registry row makes its blobs silently
  GC-eligible; the imagery/expressions lesson, `reuse-seam-check-both-ends`).
- **Batch import** = N CAS stores + N registry rows in one owner-scoped verb; a per-image magic-sniff refusal
  drops that one image with a reported reason, never the whole batch (the honest-partial posture). A DWPose
  extraction step (arch-internal, the kit's `DWPreprocessor`) converts an uploaded PHOTO into a skeleton before
  store, when the user imports photos rather than ready maps — gated on the DWPose preprocessor nodes being
  installed (§4.12.4).
- **Custom categories/tags** are user-declared free text (normalized like the expressions custom-label rule:
  trim → NFKC → lowercase); the kit's 13 categories seed the suggestion list, never a whitelist.

#### 4.12.3 The picker (client — a real browsing affordance, not a dropdown)

A visual grid of skeleton thumbnails at generation time — **670 skeletons in a dropdown is not a picker**:

- **Virtualized grid** — the `@tanstack/react-virtual` precedent already in the client
  (`features/chat/surfaces/message-list-surface.tsx`; `virtual-core-paddingend-for-pins`), rendered through the
  **`@orb/ui` media primitive** (`packages/ui/src/primitives/media-grid/media-grid.tsx` + `crossfade-image` for
  the thumbnails) — NEVER a raw `<img>` in a feature (the D44 media-element gate,
  `media-element-needs-ui-primitive`: the policy-carrying primitive is the only suppression-free home).
- **Honest search/filter off the index taxonomy** — filter by category (the kit's 13 + user categories), free-text
  name search, and a source badge (`curated` | `byo`). Curated + BYO browse in ONE grid, peer selection.
- **Where it mounts:** the imagery panel's ADVANCED-knob disclosure — pose is one lever of the advanced set (the
  curated-knob-depth surface, §8 Q4). It rides that disclosure BUT gets its own real browsing modal/drawer (the
  grid), not an inline dropdown; picking a pose sets the request's optional pose selection and shows a chosen-pose
  chip with a clear affordance.
- **Selection on the wire:** an OPTIONAL pose selection on the imagery request's advanced surface — a
  `poseAssetId` (BYO) or a curated pose id — resolved by the arm to a skeleton image. The exact wire home follows
  the §8 Q4 curated-knob-depth ruling (an advanced-params field, capability-gated); it is NOT new shared-wire
  vocabulary the hosted arms carry (they advertise no controlnet, so the knob is absent for them — capability
  truth).

#### 4.12.4 Optional + capability-honest (the non-negotiable)

Pose attaches ControlNet ONLY when a pose is picked, and the picker is offered ONLY when the availability manifest
(§4.4) confirms BOTH: (a) the selected arch/role supports controlnet — the kit's `union_promax` (SDXL) /
`flux_union_pro2` (FLUX) / `anima_lllite` (Anima) method tags; a role whose family has no controlnet method
advertises no pose; AND (b) the pose ControlNet model + the DWPose preprocessor nodes are installed (checked via
the extended `/object_info` node-class read, §C5). When either is absent the picker surface is **honestly absent/
refused with the reason** ("this model has no ControlNet / the OpenPose model isn't installed"), NEVER a silent
no-op that ignores the picked pose. The pose selection extends `ModelCapability.imageGen` with a `pose` boolean
per role — advertised only where it truly attaches.

> **BUILT (C6, 2026-07-19):** the four OPTIONAL levers (`img2img`/`inpaint`/`identity`/`pose`) landed as a ONE-HOME
> `levers: { img2img, inpaint, identity, pose }` object on `ComfyuiRoleAvailability` (`@orb/contracts/connection`),
> plus a convenience `imageEdit` boolean — NOT as a lone `pose` on `imageGen`. Rationale (orchestrator-ratified):
> the picker already reads the role-availability object, so all per-lever grounding one-homes there; a single
> `imageGen.pose` would double-home pose and leave inpaint/identity/img2img ungrounded. Each lever is grounded
> against the live node classes (per-lever node manifests in `availability.ts`, pinned ⊆ the lever parity
> goldens); flux inpaint additionally requires the Fill UNET in the catalog. The runner honors the levers off
> `roleLeverSupport` (family method tags) and drops an unsupported lever with a granular belt warning
> (`image_inpaint_dropped` / `image_identity_dropped` / `image_pose_dropped`).

**BYO workflows participate via a `%pose_image%` placeholder** — the placeholder-capability rule (§4.11.2)
extends naturally: a saved workflow that declares `%pose_image%` (bound to the picked skeleton's base64, the
marinara reference-image-placeholder posture with the 1×1-PNG fallback when no pose is picked) advertises pose;
one that doesn't, doesn't offer it. Same honest-declaration mechanism, no special case.

#### 4.12.5 What stays UNCHANGED

Pose is purely additive: no hosted-arm change (they carry no controlnet — the picker is simply absent there); the
imagery domain/wire stays arm-agnostic (the pose selection is an advanced-knob optional, capability-gated like
every other); the curated and BYO tracks both gain pose through their existing channels (arm-internal control
image / `%pose_image%` placeholder) and converge at the same drive step.

## 5. The gap list

### 5.1 Kit has it; the backend can't drive it yet

1. **Multi-arch graph building** (sdxl/flux/anima/anima\_edit) — backend has ONE txt2img template. (The fork.)
2. **Curated roles** (13) + the family/role registry — no selection channel; `model` = bare checkpoint only.
3. **LoRA stacking + the LoRA catalog** (ports as a STATIC reference of installed LoRAs; the kit's Civitai
   auto-download does NOT port — owner-ruled, §C8) — no channel; no catalog surface today.
4. **Controlnet / pose** (union-promax / flux-union-pro2 / anima-lllite) + the \~670-skeleton library (13
   categories) — no control-image channel wired, no pose picker, no BYO pose import (§4.12 is the track; the
   picker/import is a first-class client surface, not a dropdown).
5. **Identity lock** (IPAdapter FaceID / PuLID) — the B3 `useAvatarReference` consumer exists in the imagery
   design but no local runner honors it.
6. **img2img / inpaint** (DiffDiff / FLUX-Fill / LanPaint auto-select) — the `edit` payload is DROPPED-with-
   warning on ComfyUI today.
7. **FLUX Kontext / Redux edit** — no edit runner on the ComfyUI arm.
8. **Detailer chains** (face/hand/eyes/NSFW), **upscale** (ESRGAN / UltimateSDUpscale), **postfx**, **detail
   daemon** — no quality-tier channel.
9. **best-of-N + judge**, **sprite/expression packs**, **character assets/roster**, **prompt compiler**,
   **prompt guide**, **bg-remove**, **DWPose extract** — none reachable.
10. **Init/reference/mask upload** (`POST /upload/image`) — the arm has no upload step.

### 5.2 The backend has it; the kit doesn't (must be preserved)

1. **BYO custom workflows — a FIRST-CLASS track** (§4.11, ST/marinara bar): the kit has no "drive an arbitrary
   user graph" path. orbweaver has the pieces (`isComfyuiGraph`, `injectComfyuiValues`, the default-template
   substitution mechanics) but NOT the ST/marinara SURFACE — multiple saved named workflows per user, a
   placeholder editor with live discovery, custom find/replace bindings, reference-image placeholders, a
   per-generation picker, and per-workflow capability derived from the placeholder set. That surface is the C7
   build (§7); it rides the existing diffusion-params vocabulary (requirement 2) and the full orbweaver spine.
2. **SSRF-safe egress** (`safeFetch` + host-pin + byte caps) — the kit uses raw stdlib `urllib`; orbweaver's
   security posture already wraps all ComfyUI traffic (`safeFetch`, MA-8/D96). Under (b') the builder is
   in-process and the ONLY egress is orbweaver's own already-guarded runner — the kit's `client.py` transport is
   superseded wholesale (nothing kit-originated ever hits the network).
3. **Provenance + assets + stats + reuse gate** (`imagery_generations`, CAS `"generated"`, the identity-hash
   reuse gate, stats deltas) — the kit writes bare PNGs to disk; orbweaver's whole durable/GC/economics layer is
   orbweaver-owned and stays so.
4. **Capability honesty + the tri-state probe** — the kit assumes its models exist; orbweaver must detect and
   refuse honestly.
5. **Magic-byte mediaType sniff** — orbweaver validates bytes; the kit trusts filenames.

## 6. Conflicts with existing law

- **D96** ("ONE local image-generation arm; workflow-graph API is backend-internal; owner-configured endpoint;
  honest capability absence"): this spec is a NARROWING/EXTENSION, not a conflict — and the ruled (b') shape sits
  ENTIRELY inside D96's letter. The native TS builder is exactly what D96 anticipates by "a sealed
  `backends/comfyui/` arm": the graph vocabulary is built in-process and never leaves the arm (a strictly
  tighter seal than the earlier-considered sidecar). D96 already provisions the diffusion-knob capture surface
  (`ModelCapability.imageGen`, D95). **The one ledger touch:** a new D-entry recording that the curated ComfyUI
  graph-building is a native TS engine ported from `orbgen` (the Python DEMOTED to reference implementation +
  parity oracle), so a future reader doesn't mistake the Python kit for a live dependency. It NARROWS D96 the way
  D96 narrowed D39/D47/D49 — depth within the one already-ruled source, no new source, no new endpoint.
- **The imagery design letters** (D100, `history/imagery-design/`): NO conflict — this spec CONSUMES them. The
  `edit` seam (§4.6), the `useAvatarReference`/B3 consumer (03 §3), the capability gate (03 §1), the
  diffusion-params thread (I0/D95), and the arm-agnostic wire are all exactly as the imagery design commits. The
  curated-role selection rides the existing `model` slot without touching the imagery wire. The one imagery-side
  note: the imagery design's I2 belt (`image_edit_dropped`) currently DROPS edits on ComfyUI; this spec makes the
  ComfyUI arm HONOR edits for curated roles whose family supports it — the belt stays as the honest refusal for
  roles/BYO graphs that can't.
- **The expressions design** (D90): NO conflict — the kit's expression/sprite power surfaces through
  `imagery.generatePicture` (the injected front door), preserving the leaf discipline (§4.7). The `matte:"model"`
  RMBG arm the expressions design commits and the kit's `remove_background` are the same capability.
- **`GENERATE_IMAGE_SOURCES` / `deriveRunner` / the firewall**: no new source needed — `comfyui` already exists;
  this is depth WITHIN the existing source, so the "new-router-needs-sweep-classification" coupled-site set does
  NOT re-fire (no new tRPC procedure unless the BYO-import or curated-catalog surface adds one — flag §8).

## 7. Chunked build plan (sizes S≈½day, M≈1-2d, L≈3-5d)

The fork is RULED (§4.1) — no gate chunk. The honest cost is a \~3k-LOC builder-logic port (driving/egress/assets
already owned via MA-8/D96); it chunks along the kit's own layering. Parity goldens (§4.10) ride each builder
chunk. C1-C2 are the SHARED spine (common graph fragments + one arch), then per-arch modules parallelize.

**C0 — the parity-oracle capture harness (S, FIRST).** A repeatable script that runs the Python kit's builders
over the §4.10 input matrix and freezes each emitted API-format graph as a fixture under `tests/`. This is the
oracle every builder chunk asserts against; capturing it first means every subsequent chunk lands test-first.
Also re-probe the live instance (owner says models are now up) to ground the availability manifests (§8 Q7).

**C1 — the builder CORE + shared fragments (M).** Port `graphs/common.py` (upscale tails, detailer chains,
control-map, regions, masks, segment-mask) + the `Family`/`Role` registry types + the knob-merge precedence
(per-call > role override > family) + `isComfyuiGraph` self-check on every emit. No arch yet — the scaffold the
arch modules compose from. Tests: fragment goldens; precedence order.

**C2 — the SDXL arch module + first curated role end-to-end (M).** Port `graphs/sdxl.py` (checkpoint/CLIP/
KSampler, LoRA chain, vpred patch order, clip-skip, controlnet, inpaint DiffDiff, img2img, detailers, hires,
upscale) + the sdxl families/roles (`noobai_eps`/`vpred`/`lustify`/`pony_real`). Wire the `model`-slot namespace
(`orbgen:<role>` vs raw checkpoint); the arm builds the curated graph and drives it through the EXISTING runner;
params thread (steps/cfg/sampler/scheduler/seed/size/n) forwarded; per-role capability descriptor. The first
end-to-end curated generation — PROBED-bytes achievable live (owner's box has models). Tests: sdxl parity
goldens; a curated role resolves → builds → drives → asset + provenance, **composed-real through the real
runner** (the D100 lesson: a faked executor hid a dead seam).

**C3 — the FLUX arch module (M).** Port `graphs/flux.py` (UNET/DualCLIP/VAE, guidance-as-cfg, ModelSamplingFlux,
FLUX-Fill inpaint swap, Union-Pro-2.0 controlnet, PuLID identity, Kontext edit, Redux, detail-daemon, detailers)

- the `flux` family/roles. Tests: flux parity goldens incl. the Fill swap + Kontext/Redux.

**C4 — the Anima arch modules (M).** Port `graphs/anima.py` (`build_anima` + `build_anima_edit` — Qwen CLIP/VAE,
AuraFlow shift, CFGZeroStar, LanPaint inpaint, LLLite pose, reference-latent edit graph) + the anima families/
roles + the img2img→edit-graph reroute. Tests: anima parity goldens incl. the edit-graph reroute.

**C5 — availability + the picker surface (M).** Extend `probeComfyuiObjectInfo` to read registered node classes;
per-role manifest resolution (required checkpoint/UNET/controlnet/adapter/detector/nodes); `getModelsForSource`/
`probeComfyui` list raw checkpoints + curated roles with live availability + the disabled-with-reason refusal
(honest degrade). Tests: availability matrix (present/missing model, missing node class, ok-but-empty).

**C6 — the edit/reference/pose seam + the controlnet builder (M).** `POST /upload/image` arm step;
`edit.{image,mask,references}` → img2img / inpaint / identity (the arch modules already carry the methods);
`imageEdit` capability true per family; B3 `useAvatarReference` goes live on the local arm. The pose CONTROLNET
build side: a picked skeleton → the family controlnet (union-promax / flux-union-pro2 / anima-lllite), gated on
the controlnet model + DWPose nodes being installed (§4.12.4); the `pose` capability boolean per role; the
`%pose_image%` BYO-workflow placeholder. Tests: img2img, inpaint (mask), identity (reference), pose→controlnet
attach, the honest refusal for a non-edit / non-controlnet role.

**C6b — the curated pose LIBRARY (S).** Ship/sync the kit's \~669 skeletons as a packaged static pose set + a
GENERATED index (`{id, category, name, thumbnailSrc, orientation}`) derived verbatim from `poses/index.json`'s
13-category taxonomy (the theme-pipeline precedent — static shipped content + generated index, NOT per-user CAS
rows). Tests: index↔asset-set integrity; category counts match the kit's index.

**C6c — BYO pose import (M).** The `"pose"` AssetKind (born-compliant `ASSET_KINDS` addition + db CHECK regen);
the owner-scoped `pose_library` registry (no `ownerId`, ownership via `assetId → assets.ownerId`; the `asset-refs`
retaining-ref row — the GC obligation); the single + batch upload verb (per-image magic-sniff, honest-partial on
a bad image; optional DWPose-extract for photo imports, gated on the preprocessor nodes); custom category/tag
normalization. Tests: kind↔CHECK mirror; FK CASCADE; ref-registry enumerates the pose column; batch partial-drop;
cross-owner isolation; magic-sniff refusal.

**C6d — the pose PICKER + import UI (M, client).** The virtualized skeleton grid (`@tanstack/react-virtual` +
the `@orb/ui` `media-grid`/`crossfade-image` primitive — never a raw `<img>`, the D44 gate); honest search/filter
off the index taxonomy; the `curated`|`byo` source badge; curated + BYO in ONE grid; mounted in the imagery
panel's advanced-knob disclosure with its own browsing modal (not a dropdown) + a chosen-pose chip; the import/
batch-upload affordance. Offered ONLY when the availability manifest advertises pose (capability-honest — else
absent/refused with the reason). Tests: CTs for grid render/filter/badge/chosen-chip; the capability-absent
refusal; the picked-pose → request wiring.

**C7 — the BYO custom-workflow TRACK (M-L, FIRST-CLASS, PARALLEL — independent of C1-C6).** Built to the
ST/marinara bar (§4.11). Sub-chunks: (a) the per-user saved-workflow store (owner-scoped; §8 storage-home
question) + the substitution engine (generalize `buildDefaultComfyuiGraph`'s numeric/string-token mechanics
from the one hardcoded template to a stored workflow; `isComfyuiGraph` self-check after parse); (b)
placeholder-binding onto the existing diffusion-params vocabulary + the edit-seam image placeholders
(`%reference_image_NN%`/`%init_image%`/`%mask%` ← `req.edit.*`, 1×1 PNG fallback on absence — marinara's
posture); (c) per-workflow capability DERIVED from the placeholder set (no `%mask%` ⇒ no inpaint offered — the
honest-declaration rule); (d) the `byo:<workflow>` third selection value on the `model`-slot channel + the
picker; (e) the CLIENT editor (JSON textarea + "Save (API Format)" hint, the built-in placeholder panel with the
live found/not-found discovery indicator, custom find/replace rows, workflow New/Rename/Delete, save-time
validation) — ST's affordances, cited. Requirement 2. Tests: substitution goldens (numeric bare / string
escaped-quoted / image base64 / missing-image fallback); placeholder-discovery → capability derivation matrix; a
malformed workflow refuses honestly; `byo:` + `orbgen:` + raw-checkpoint coexist; composed-real drive through the
real runner (the D100 lesson). *(Seed workflows — a default txt2img + a reference/img2img workflow, ST's two
seeds — ship as starting points.)*

**C8 — quality tiers + LoRA reference + prompt guide (M).** The curated knob subset (quality/fast/mode, LoRA
slugs from the ported catalog + trigger injection, detailers/upscale/postfx) advertised via extended `imageGen`
capability; the `guide_for` prompt-guide surface. **The LoRA catalog is a STATIC REFERENCE of installed LoRAs**
(name/base/trigger/recommended-weight — owner-ruled 2026-07-19: the Civitai machinery "was just made to give an
idea of what loras we have"); the runtime `civitai.download_version` auto-download does NOT port at all (a
missing LoRA = an honest refusal, the owner installs it — no runtime Civitai egress, no supply-chain surface).
Tests: knob → kwarg forwarding; capability advertises only honored knobs.

**C9 — expressions/character-asset curated modes (M-L, owner-gated by §8 Q6).** If the owner wants the kit's
higher-fidelity expression/sprite path, it lands as a curated imagery mode consumed by `domain/expressions`
through the existing injection — NOT a new seam. Design-first sub-spec before build.

**C10 — best-of-N + judge (S-M, optional).** The kit's judged best-of as a curated quality lever with the honest
unscored arm (VLM/PickScore backend; ships the first candidate + `scored:false` when no judge is reachable).

## 8. Open owner questions — ALL RULED 2026-07-19

*(The fork and the sidecar-deployment question are CLOSED — ruled (b'), native TS engine, no sidecar. The
remaining shape details were RULED by the orchestrator under the owner's standing delegation ("I let you,
with knowledge of our house rules, make the decisions") — each ruling is stamped inline below with its WHY.
The build is UNLOCKED: C0 first.)*

> **THE RULINGS, in brief:** (1) chunk sequencing confirmed as written. (2) `model`-slot namespace CONFIRMED
> — the modes canon (api × source → backend) is already namespaced-value dispatch; a new wire field would
> fork the shared imagery wire for zero gain. (3) NSFW roles surface BEHIND the existing NSFW consent gate
> (the D61 hub precedent: badged, default-off, never laundered, never silently dropped) — first-class once
> enabled. (4) knob depth: the SIMPLE set (the existing diffusion-params) is the default surface; the kit's
> rich levers (LoRA slugs, pose picks, quality tiers, framing) surface behind an ADVANCED disclosure, driven
> by a per-role knob MANIFEST derived from the role registry (never hardcoded client forms — lock the
> extensible shape); v1 ships the manifest machinery + the levers the kit's roles already parameterize.
> (5) expressions: the kit's face-inpaint becomes the CURATED-arm expression path (higher fidelity, identity
> lock); the landed grid-slice stays the arm-agnostic path for hosted/BYO arms — two honest arms per
> plan-for-small-hardware, no silent degrade either way; C9 stays design-first on the splice details.
> (6) confirmed — C0 runs the live probe; the availability manifests are grounded by the probe, and a full
> PROBED-bytes run is REQUIRED at build time (models are present). (7) already closed (no Civitai runtime
> egress). (8) BYO storage = the DEDICATED owner-scoped TABLE (`comfyui_workflows`, ownerId stamped,
> unique(ownerId,name) — the roster\_presets TRUE-PRODUCER precedent): a workflow library is a first-class
> user collection with CRUD/GC posture, and settings blobs are for knobs, not collections (the
> versioned-config lift class is the standing warning). (9) CONFIRMED — the placeholder set IS the
> capability declaration; derive, never hand-declare. (10) confirmed — every new procedure lands
> sweep-classified same-change. (11) the D-entry is MINTED AT BUILD-LAND (covering the TS engine + the BYO
> track + these rulings), the D97–D100 pattern.

1. **The honest cost, acknowledged (not a question — a checkpoint).** The builder port is \~3k LOC of engine
   logic, chunked C0-C10 (§7). The owner chose right-once over cheap; the driving/egress/assets/provenance half
   is already owned (MA-8/D96, the vLLM-arm/engine-supervisor precedent), so the port is builder logic ONLY. Confirm
   the chunk sequencing (shared spine C1-C2, then per-arch C3-C4 parallelize) fits the intended cadence.
2. **Selection channel** — confirm the `model`-slot namespace (`orbgen:<role>`) over a new wire field. Any
   objection to overloading `model` (keeps the shared imagery wire arm-agnostic)?
3. **NSFW roles** — the kit is explicitly adult-capable (NSFW roles, the \~670-skeleton library incl. explicit
   categories). Do curated NSFW roles surface in the picker unconditionally (owner's private local tooling), or
   behind a setting/consent gate? (Affects the capability/picker surface, not the arch.)
4. **Curated knob depth (§4.3)** — how much of the kit's rich lever set (LoRA slugs, pose library, quality tiers,
   `kind` framing) surfaces to the USER vs stays arm-internal curated-role defaults in v1? More surface = more
   `imageGen` capability + panel work.
5. **Expressions fidelity (§4.7)** — adopt the kit's face-inpaint expression path as a curated mode (higher
   fidelity, per-emotion identity lock) or keep the grid-slice sprite sheet the expressions design already ships,
   with the kit only supplying the RMBG matte? A design-first call (C9).
6. **Models present now** — D96 recorded zero checkpoints at build time; the owner now says models are up. C0's
   fresh `probeComfyui` against the live instance confirms the exact installed checkpoint/node set so the
   availability manifests are grounded, not guessed (the `audit-lists-are-snapshots` lesson) — AND makes a full
   PROBED-bytes live run achievable at build time (§9).
7. **Civitai auto-download — CLOSED (owner, 2026-07-19): does not port.** The kit's `civitai.download_version`
   was a cataloging aid ("just made to give an idea of what loras we have"), not a runtime feature. The LoRA
   catalog ports as a STATIC REFERENCE of installed LoRAs; no runtime Civitai egress exists (§C8). A missing
   LoRA is an honest refusal, never an auto-fetch.
8. **BYO workflow STORAGE home (§4.11.2)** — multiple saved named workflows PER USER (ST's library model, not
   marinara's one-per-connection). Owner-scoped, JSON invisible to the domain (D96). A dedicated owner-scoped
   table (`comfyui_workflows`) or a settings-namespace blob? A table gives clean CRUD + GC posture; a blob is
   lighter but caps size/queryability. Open shape question — decide before C7(a).
9. **BYO capability from placeholders (§4.11.2)** — confirm the "placeholder set IS the capability declaration"
   rule (no `%mask%` token ⇒ inpaint not offered). It is the honest-refusal mechanism; the only alternative
   (a user hand-declaring capabilities separately) is more surface for the same truth. Recommendation: derive.
10. **New transport surface** — the curated-catalog, the BYO editor/CRUD, AND the pose-library/import (list
    curated + BYO poses, upload single/batch, delete) client surfaces add tRPC procedures; ALL need cross-tenant
    sweep classification (`new-router-needs-sweep-classification`) — the pose-import verbs are owner-scoped
    writes (PROBED) and the curated-pose list is a global read (EXEMPT). Confirm scope so the coupled sites are
    planned, not discovered.
11. **Pose storage split (§4.12.1–4.12.2)** — confirm the curated=global-shipped-static vs BYO=per-user-CAS +
    `pose_library` registry split (the theme-pipeline + `character_sprites` precedents). The alternative
    (seeding 669 curated skeletons into every user's CAS) is the D20/D23 doubling — recommendation: shipped
    static + generated index for curated, owner-scoped rows for BYO.
12. **The D96 amendment** — ratify a new D-entry recording the native TS engine (Python demoted to reference
    implementation + parity oracle), the first-class BYO custom-workflow track, AND the pose library/picker
    track, narrowing D96 the way D96 narrowed D39/D47/D49 (§6).

## 9. Probe class

Per the MA-8/D96 precedent, the curated engine lands **PROBED-mechanics** — the build/drive path (registry →
graph build → `isComfyuiGraph` self-check → `/prompt`→`/history`→`/view` → magic-sniff → asset) exercised
against the live instance. The MA-8 caveat (`UNPROBED-bytes`, because the owner's box had zero checkpoints) is
NOW LIFTABLE: the owner states models are installed, so a **full PROBED-bytes live run is achievable at build
time** — a curated role generating a real image end-to-end, the first genuine bytes through the orbweaver
ComfyUI arm. C0's re-probe confirms the installed set; C2's checkpoint is the first PROBED-bytes curated
generation. The parity goldens (§4.10) are the offline executable contract; the live PROBED-bytes run is the
evidence the port produces real images, not just structurally-valid graphs.
