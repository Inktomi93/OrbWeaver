---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — SillyTavern Feature-Gap Register

> **Status: CLOSED, CANONICAL inventory (ledger D49).** The complete catalog of SillyTavern (ST) features orbweaver would ever consider — Nate: *"anything we identified is the sum total of what we would want."* Every row carries a DISPOSITION: `committed` (a ledger D-entry) · `deferred-with-a-reserved-home` (a `FLAG[PD-x]` row) · `by-design-out` (rejected by a decision/the constitution). **A cold agent does NOT re-audit ST** — re-opening "should we add X from ST?" without a row here is out of bounds; if a genuinely new ST feature surfaces, ADD a row with its disposition rather than re-running the audit.
>
> **OWNERSHIP:** this doc = the CLOSED D49 inventory with dispositions — rows live THERE; [`Core-SillyTavern-Feature-Map.md`](Core-SillyTavern-Feature-Map.md) = the reconciled ST→orbweaver build MAP that summarizes it.
>
> **Dispositions are law; STATUS below is verified against the code 2026-07-13.** On any status disagreement, trust the code, then the PD registry (`Core-Audits-and-Debt.md`); [`Core-SillyTavern-Feature-Map.md`](Core-SillyTavern-Feature-Map.md) is the reconciled build map.
>
> **Not a to-do board.** A `STILL-GAP` disposition names the staging program that owns it or says `unscheduled`; the ONLY live UI work board is [`../proposed/ui-cohesion-north-star.md`](../proposed/ui-cohesion-north-star.md). Audit provenance (the 2026-06-28 5-agent sweep) + the planning-snapshot essays are frozen in [`../history/st-feature-map-archaeology-record.md`](../history/st-feature-map-archaeology-record.md).
>
> **Cold-read orientation:** orbweaver is a maximal-rigor remake of *neo-tavern*, itself a remake of *ST*. Neo already cut ST down to a focused chat/character/memory engine, so most gaps were created at the **ST→neo** step — not new orbweaver deletions. Constitution: the package cake `kit ← contracts ← db ← server ← client`, sealed provider backends, two ownership categories (D18/D23), no extension/scripting runtime.

## Legend

**Status** — `ABSENT` (not built) · `PARTIAL` (capability exists, surface/wiring missing) · `RESERVED` (a born-compliant column/seam exists, impl deferred) · `COVERED`/`BUILT` (orbweaver does an equivalent, in-tree) · `BY-DESIGN-OUT` (deliberately rejected).

**Add-back difficulty** —

- `TRIVIAL` — a thin surface over an existing seam.
- `MODERATE` — normal feature work; fits existing patterns (a domain verb, a request-shaper, a client surface).
- `PAINFUL` — small code wrapped around new persistence, a dropped subsystem, or a gate/security conflict.
- `ARCHITECTURAL` — needs a subsystem orbweaver doesn't have (a protocol path, an inference role, an audio transport, a sandbox/scripting runtime) — or conflicts with the constitution.
- `N/A` — recommend never (no product fit / superseded by an orbweaver decision).

## 1. Inference backends & sampling

The wall behind most of this: orbweaver speaks **`ChatApi = agent-sdk | chat-completions | responses`** — all OpenAI-shaped messages/agent-session protocols. It has **no raw text-completion path** and no instruct-style prompt-assembly. Anything text-completion is not "add a source" (the D39 template only fits OpenAI/Anthropic-wire backends) — it needs a 4th protocol axis + an assembly subsystem the design rejects.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
| - | - | - | - | - |
| AI Horde | crowdsourced volunteer-GPU, async job-poll, text-completion | ABSENT | ARCHITECTURAL | new `ChatApi` (async-poll) + text-completion assembly; `deriveRunner` has no non-SSE arm |
| NovelAI | proprietary text-completion wire, NAI samplers, NerdStash tokenizer | ABSENT | ARCHITECTURAL | non-OpenAI wire + tokenizer-zoo (a decided wall) |
| KoboldAI (classic) | raw `/generate`, `sampler_order`, text-completion | ABSENT | ARCHITECTURAL | text-completion wall. (Modern KoboldCpp in OpenAI mode is covered by `custom_openai`) |
| textgen family (ooba/aphrodite/tabby/llama.cpp/ollama/togetherai/…) | \~15 backends + \~60 samplers | PARTIAL | MODERATE (compat) / ARCHITECTURAL (raw) | OpenAI-compat members **already covered** by `custom_openai`/`vllm`; only raw-text-completion members hit the wall |
| Direct model providers (native Anthropic/OpenAI/Google keys, not via OpenRouter) | direct chat-completion sources | COVERED (Anthropic) | MODERATE | BUILT: `infra/providers/backends/anth-direct` (paid-key Anthropic-messages). `openai`/`google_vertex` are storable `CRED_PROVIDERS` slots with the resolver arm reserved (route via openrouter/`custom_openai` today) |
| instruct-mode + context templates | wraps turns into one completion string | ABSENT | ARCHITECTURAL | no text-completion runner to feed; structurally rejected |
| sysprompt library | named, macro-substituted system prompts | STILL-GAP | MODERATE | unscheduled; `systemPrompt {static,dynamic}` + `kit/macro` exist, but no named-library CRUD surface |
| CFG scale | negative-prompt + guidance\_scale | ABSENT | ARCHITECTURAL | only text-completion/NAI honor it; OpenAI wire has no `guidance_scale` |
| logprobs display | per-token probability viz | STILL-GAP | MODERATE | unscheduled; chat-completions/responses carry `top_logprobs` (not agent-sdk); display-only |
| sampler select / ordering | reorder `sampler_order`/priority | ABSENT | ARCHITECTURAL (PAINFUL via passthrough) | a raw-textgen concept; survives only as an untyped `customParameters` blob. (The mainstream sampling KNOBS below are BUILT — this row is the raw ordering only) |
| mainstream sampling knobs (temp/top\_p/top\_k/min\_p/penalties/seed/stop) | per-request sampling | COVERED | — | BUILT: capability-gated, descriptor-driven in `preset/…/capability-panel-model.ts` (`SAMPLING_KNOB_SPECS`) → `params-panel.tsx`; resolved to backends. Knobs render only where `ModelCapability` carries a `Range` |
| logit bias | per-token bias | PARTIAL | MODERATE | gate synthesized from the OpenRouter catalog + resolved to backends; UI exposes it as a boolean flag. Bias-by-word still needs a real tokenizer |
| tokenizer zoo | per-model tokenizers (tiktoken/LLaMA/NerdStash/…) | BY-DESIGN-OUT | ARCHITECTURAL | `kit/tokens` deliberately rejects the zoo (decided); truth = provider `usage`. Only token-id features need it |
| grammar / JSON-schema constrained output | `json_schema`/`response_format` | STILL-GAP | MODERATE–PAINFUL | committed D48 as a separate `response_format` axis; the `ModelCapability.output.structured` contract gate exists but NO resolver sets it true and no runner emits — deferred (tool-use staging) |
| exotic samplers (DRY, XTC, mirostat, dynatemp, top\_a, TFS, typical\_p, smoothing…) | textgen sampler set | PARTIAL | MODERATE (per-knob) | ride `customParameters` today (no first-class UI); the mainstream knobs got a panel, these did not. First-class = a contract cascade per knob |

**Gotcha:** `custom_openai` + `customParameters` already silently cover much of the textgen world; don't rebuild ollama/tabby/llama.cpp-server as named sources (that's a `no-inline-union-redecl` doubling).

## 2. Presentation & multimedia (the "visual novel" layer neo dropped)

Mostly client (Phase 6). Several resurrect the VN scene compositor orbweaver removed, or need an inference role that doesn't exist.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
| - | - | - | - | - |
| Welcome screen | landing: recent/pinned chats | BUILT | — | `chat/surfaces/chat-landing-surface.tsx` — hero + recent chats + quick-pick character row |
| Gallery | per-character image grid | BUILT | — | v1 grid + v2 curation: assets `list-gallery`/`add-to-gallery`/`remove-from-gallery` verbs + client dialog |
| Image-gen in chat (txt2img portrait/"selfie") | SD ext generate-from-chat | BUILT | — | `domain/imagery/verbs/generate-picture.ts` + chat wiring (`domain/chat/verbs/generate-image.ts`) → `MessageMedia` |
| Expressions / sprites | emotion classifier → sprite swap (+ live2d/VRM) | RESERVED | ARCHITECTURAL | committed D49, PD-56 — `@orb/contracts/expressions` (`EXPRESSION_LABELS`) + `character_sprites` schema born, sprite-sheet runner stubbed; needs the classify role + per-turn hook. Staged: expressions-design |
| Backgrounds (app background image) | set an app/chat-chrome background image | BUILT | — | D63: FLAT `appearance` settings (`backgroundImageKind`/`backgroundSeededId`/`backgroundExternalUrl`/`fit`/`dim`) applied once at app root via `<ThemeBackgroundLayer>` + scrim; base surface color stays a `ThemeOverride.background` token. NOT the VN compositor |
| Audio / BGM / blip sounds | scene/char music + typing blips | ABSENT | PAINFUL | player is trivial; "which track for this scene" needs new persistence + VN coupling |
| TTS (text-to-speech) | \~30 providers + narrate pipeline | ABSENT | ARCHITECTURAL | a new inference role **and** a streaming-audio transport (SSE is text/JSON) + turn hook |
| STT (speech-recognition) | voice input | ABSENT | ARCHITECTURAL | new audio-in transport + role |
| Dynamic custom CSS + rich HTML cards + inline media | per-char/chat CSS, stat-block HTML, inline images/audio/video | BUILT | — | D44: token-override Tier A (`@orb/ui` `<ThemeScope>`, zero injection) + Tier B `content/sandbox-frame` null-origin sandboxed iframe for raw HTML/CSS; media via `MessageMedia` + `forbidExternalMedia` |
| UI themes / moving-UI | drag-reposition panels + themes | BY-DESIGN-OUT | N/A / MODERATE | container-driven layout replaces moving-UI; theming maps onto DTCG tokens (the appearance skins) |
| Server thumbnails / animated-image detect | thumbnail gen + isAnimated | STILL-GAP | MODERATE | unscheduled; needed at scale by gallery/backgrounds — check `infra/image` coverage before building |

**Gotcha:** everything per-message (expressions, TTS-narrate, SD-in-chat, BGM auto-switch) hooks the chat turn lifecycle. Sprites/backgrounds/BGM together are effectively rebuilding the presentation subsystem the remake removed.

## 3. Scripting & extensibility

**Addressed by D46 — not re-litigated here.** Tier-1 automation is contract-only today (`@orb/contracts/automation`); the build designs are parked in `../proposed/` (see `../proposed/INDEX.md`) (`../proposed/{automation,plugin}-design/`). Where the ST surface lands:

| Feature | What it is (ST) | Status | Where addressed |
| - | - | - | - |
| Macros (`{{…}}`) | substitution engine | COVERED (+DX gap) | `kit/macro` exists; DX layer + CEL committed (D46) |
| Variables (local) | per-chat var bag | COVERED | delta-fold on the chat variant plane (D46 seam) |
| Variables (global) | cross-chat vars | committed | per-user `fetchOwned` KV (D46) |
| Regex scripts | find/replace engine | COVERED | `kit/regex` exists |
| Quick Reply | event→script buttons | committed | Tier 1 declarative automation (D46) |
| STscript (imperative: `/while`, closures, pipes) | the slash-command language | committed | Tier 2 QuickJS sandbox, dual-mode (D46) |
| Slash-command set (\~289 cmds) | command dispatch | committed | Tier 1 actions + Tier 2 host API (D46) |
| Third-party extensions (`getContext()` god-object) | dynamic-import plugins | committed (re-architected) | Tier 2 capability-manifest membrane (D46) — **the ST model is BY-DESIGN-OUT** |
| `setExtensionPrompt`/`/inject` | runtime prompt injection at depth | PARTIAL | `kit/injection` exists; a Tier-1 action seam |
| The client event bus | `eventSource`/`event_types` | ABSENT | replaced by the D50 `PromptTransform` seam + Tier-1 triggers |

## 4. Data ingestion & RAG-auxiliary

orbweaver rebuilt the vector substrate (embeddings/search/memory) but it is **canon-derived** — every vector row is a pure function of chat/character/asset canon. An uploaded *document* is not derivable from canon (it **is** canon), which is why the Data Bank class needs a parallel doc-store, not a graft.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
| - | - | - | - | - |
| token-counter panel | count tokens of pasted text | PARTIAL | TRIVIAL | a character-editor counter is BUILT (`character/components/character-token-counter.tsx`); the standalone paste-text panel is unscheduled |
| Translate | per-message + auto translation | STILL-GAP | MODERATE | unscheduled; would be a `summarize`-style request-shaper over the `chat` role; no new backends |
| Caption (standalone, ad-hoc) | "describe this image" → text | PARTIAL | MODERATE | the vision call runs inside the embeddings indexer; needs a user-facing ad-hoc verb |
| Scrapers | web/file/youtube/wiki → Data Bank | STILL-GAP | MODERATE | simple fetchers, homeless until the Data Bank lands; databank staging |
| Web Search RAG | live search → inject results | STILL-GAP | MODERATE–PAINFUL | unscheduled; per-turn live ingestion, no orb seam |
| Server doc text-extraction | pdf/docx/epub/html → text | STILL-GAP | MODERATE | a sub-feature the Data Bank needs (vendored lib in a loader); databank staging |
| Attachments / Data Bank | per-chat/char/global file banks + doc RAG | RESERVED (D49) | ARCHITECTURAL | committed FLAG\[PD-57]: `documents` producer + scope junctions born (`db/schema/databank.ts`), `document_chunks` in the vector home, ingest/reindex workload runners STUBBED (return deferred). Staged: databank-design |
| Vectors as file-RAG | chunk+embed+retrieve uploaded files | STILL-GAP | PAINFUL | embed/search plumbing reuses; the producer/canon shape needs the doc-store above (databank staging) |
| assets ext (community downloader) | download chars/extensions/audio from a repo index | PARTIAL | N/A | no extension system / marketplace / ambient-audio (all OUT); the "download a character from URL" sliver is COVERED by `domain/hub` (chub/wyvern/chartavern/pygmalion, D61) |
| **Already covered** (do not re-add) | chat-memory vectorization (→ memory/embeddings/search); image-captioning *capability* (inline in the indexer); RAG retrieval machinery (embed/space/exact-scan/rerank/threshold); bulk profile import (`import` domain) | COVERED | — | |

## 5. Generative media & tools

| Feature / sub-feature | ST reality | Status | Difficulty | Note / home |
| - | - | - | - | - |
| Hosted image-gen (text→image) | DALLE/Stability/Flux via API | BUILT | — | the `generateImage` role is fully wired (hosted-only, D39) |
| Image-gen in chat flow | generate→store→render as message | BUILT | — | `domain/imagery` + chat caller → `MessageMedia` |
| Local SD backends (A1111/ComfyUI/Horde/sdcpp/drawthings/…) | 20+ local sources | BY-DESIGN-OUT | ARCHITECTURAL | each is a new credential SOURCE re-opening the firewall axis; D39 made image-gen hosted-only on purpose |
| Portrait/prompt-template modes (CHARACTER/FACE/SCENARIO/BACKGROUND) | LLM-extract → generate | STILL-GAP | MODERATE | a chat-domain two-step (extract→generate) atop the working role; imagery staging (PD-93 image-studio) |
| Inpainting / img2img | mask/init-image | STILL-GAP | MODERATE | `ImageGenerateRequest` is text→image only; contract widening + backend support; imagery staging (PD-93 image-studio) |
| `/imagine` slash surface | 4 commands | STILL-GAP | MODERATE | backend `chat.generateImage` exists, no client command surface; owned by automation staging (a Tier-1 action, D49) |
| Tool/function calling — agent-sdk path | recursive multi-tool loop | BUILT (D47) | — | one registry `domain/tool-use`, agent-sdk MCP projection; the SDK owns its loop |
| Tool/function calling — chat-completions/responses path | OpenAI-style tools + recurse | BUILT (D48) | — | the `tool` role on the WIRE axis; the chat DOMAIN owns the loop — `runRecurseLoop` in `domain/chat/engine/pipeline.ts`. PD-54 closed 2026-07-04 |
| Reasoning data + streaming + resolve | native reasoning handling | COVERED | — | `message_variants.reasoning`/effort + `STREAM_DELTA_KINDS` + `resolve-chat.resolveReasoning` (D41) |
| Reasoning `<think>` auto-parse (non-native models) | parse inline tags | BUILT | — | `server/kit/reasoning` (`parseReasoningTags`) wired in `domain/chat/engine/pipeline.ts` |
| Reasoning UI render / effort picker | collapsible blocks + effort UI | BUILT | — | `chat/components/reasoning-block.tsx` + `preset/…/params-panel.tsx` ReasoningSection |
| Vision / image INPUT (image→model) | `image_url` content parts | PARTIAL (D45) | — | the CONTRACT axis is born-compliant (`ModelCapability.input.vision` + `ChatHistoryMessage.content` content-parts), but NO resolver sets `input.vision` true and the per-backend translator is text-only — end-to-end vision input is NOT wired (unscheduled) |
| Structured-output (`response_format`) | forced JSON | STILL-GAP (D48) | MODERATE | a SEPARATE `response_format` axis (not via `tool_choice`); the `ModelCapability.output.structured` contract gate exists but is never populated + no runner emits — tool-use staging |

## 6. Deliberately OUT by design (not gaps to "fix")

Rejected by a decision or the constitution — recorded so a cold agent doesn't "restore" them:

- **ST's third-party extension model** (`getContext()` god-object + dynamic-import of unvetted code) — negates resolver-enforced boundaries. The *capability* is re-architected (D46 Tier 2 membrane); the ST *mechanism* is permanently out.
- **Raw text-completion backends + instruct-mode + CFG + sampler-ordering** — orbweaver is OpenAI-wire / agent-session only; the text-completion protocol path is not a feature, it's a second architecture.
- **The tokenizer zoo** — `kit/tokens` rejects per-model tokenizers; provider `usage` is the source of truth.
- **Global/shared (cross-user) state** — anything ST stores app-wide is either per-user (single-owned) or doesn't exist; there is no global tier (D21).
- **Community marketplace / asset downloader** — no app-store at self-hosted single-operator scale.
- **Per-char/chat arbitrary CSS** — conflicts with the token/containment gates + the "no leaks" threat model.

## 7. Shape-of-it planning snapshot (frozen)

The pre-build "cheap wins vs big lifts" prioritization + the pre-Phase-5 "now window" essay are a stale planning snapshot — most cheap wins shipped. Frozen in [`../history/st-feature-map-archaeology-record.md`](../history/st-feature-map-archaeology-record.md) §3. Current state is the tables above; the still-open small seams are sysprompt library · logprobs · translate · standalone caption · portrait/img2img · the standalone token-counter panel · end-to-end vision INPUT.

## 8. Cross-references

- Scripting/automation/variables/macro/STscript: D46; designs staged (`../proposed/automation-design/`).
- Ownership categories + the no-global-tier + image/asset decisions: ledger D18 / D20 / D21 / D23.
- Sealed backends + adding a source (the D39 template) + roles firewall: `Tier-3b-Providers.md`, D39.
- Reserved columns/roles: D37 (`toolCalls`), D39 (`generateImage`), D41 (reasoning/warnings).
- Background image = appearance settings (not a theme token): D63.
- Constitution + the cake + gates: `Core-0-Architecture-and-Structure.md`.
- **Reconciled build map:** [`Core-SillyTavern-Feature-Map.md`](Core-SillyTavern-Feature-Map.md).
