---
kind: reference
status: active
updated: 2026-07-03
---

# Orbweaver — SillyTavern Feature-Gap Register

> **Status: CLOSED, CANONICAL inventory (ledger D49, 2026-06-28).** The complete catalog of SillyTavern (ST) features orbweaver would ever consider — Nate: *"anything we identified is the sum total of what we would want."* Every row carries a DISPOSITION: `committed` (a ledger D-entry / a committed domain doc) · `deferred-with-a-reserved-home` (a `FLAG[PD-x]` row) · `by-design-out` (rejected by a decision/the constitution). **A cold agent does NOT re-audit ST** — re-opening "should we add X from ST?" without a row here is out of bounds; if a genuinely new ST feature surfaces, ADD a row with its disposition rather than re-running the audit.
>
> **Dispositions here are law; build STATUS here is frozen at audit time (2026-06-28).** Current build state lives in [`Core-SillyTavern-Feature-Map.md`](Core-SillyTavern-Feature-Map.md), which wins on any status conflict (Phase 5 has since shipped, so `ABSENT` rows whose home was "the chat turn" may now be built).
>
> **Provenance:** compiled 2026-06-28 from a source-level audit (5 parallel agents reading ST's real `public/scripts/**` + orbweaver's `packages/**` + docs). Difficulty ratings are grounded in orbweaver's actual seams.
>
> **Cold-read orientation:** orbweaver is a maximal-rigor remake of *neo-tavern*, itself a remake of *ST*. Neo already cut ST down to a focused chat/character/memory engine, so most gaps were created at the **ST→neo** step — not new orbweaver deletions. Constitution: the package cake `kit ← contracts ← db ← server ← client`, sealed provider backends, two ownership categories (D18/D23), no extension/scripting runtime. See `Core-0-Architecture-and-Structure.md` + `Core-Laws-and-Precedents.md`.

## Legend

**Status** — `ABSENT` (not in orbweaver at audit time) · `PARTIAL` (capability exists, surface/wiring missing) · `RESERVED` (a born-compliant column/seam exists, feature deferred) · `COVERED` (orbweaver does an equivalent) · `BY-DESIGN-OUT` (deliberately rejected).

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
| Direct model providers (native Anthropic/OpenAI/Google keys, not via OpenRouter) | direct chat-completion sources | ABSENT | MODERATE | the **clean D39 case**; `CRED_PROVIDERS` already reserves `anthropic\|openai\|google_vertex` slots |
| instruct-mode + context templates | wraps turns into one completion string | ABSENT | ARCHITECTURAL | no text-completion runner to feed; structurally rejected |
| sysprompt library | named, macro-substituted system prompts | ABSENT | MODERATE | preset/settings CRUD; `systemPrompt {static,dynamic}` + `kit/macro` already exist |
| CFG scale | negative-prompt + guidance\_scale | ABSENT | ARCHITECTURAL | only text-completion/NAI honor it; OpenAI wire has no `guidance_scale` |
| logprobs display | per-token probability viz | ABSENT | MODERATE | chat-completions/responses carry `top_logprobs`; **not** agent-sdk; display-only |
| sampler select / ordering | reorder `sampler_order`/priority | ABSENT | ARCHITECTURAL (PAINFUL via passthrough) | a raw-textgen concept; survives only as an untyped `customParameters` blob |
| logit bias | per-token bias | PARTIAL | MODERATE | `UserIntent.logitBias` contract + firewall gate exist; needs UI + a real tokenizer for bias-by-word |
| tokenizer zoo | per-model tokenizers (tiktoken/LLaMA/NerdStash/…) | BY-DESIGN-OUT | ARCHITECTURAL | `kit/tokens` deliberately rejects the zoo (decided); truth = provider `usage`. Only token-id features need it |
| grammar / JSON-schema constrained output | `json_schema`/`response_format` | ABSENT | MODERATE–PAINFUL | a separate `response_format` axis, committed D48 (`ModelCapability.output.structured` gate landed); wire fields ship with the tool loop (PD-54) |
| exotic samplers (DRY, XTC, mirostat, dynatemp, top\_a, TFS, typical\_p, smoothing…) | textgen sampler set | PARTIAL | MODERATE (per-knob) | ride `customParameters` today (no UI); first-class = a contract cascade per knob |

**Gotcha:** `custom_openai` + `customParameters` already silently cover much of the textgen world; don't rebuild ollama/tabby/llama.cpp-server as named sources (that's a `no-inline-union-redecl` doubling).

## 2. Presentation & multimedia (the "visual novel" layer neo dropped)

Mostly client (Phase 6). Several resurrect the VN scene compositor orbweaver removed, or need an inference role that doesn't exist.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
| - | - | - | - | - |
| Welcome screen | landing: recent/pinned chats | ABSENT | TRIVIAL→MODERATE | the reference example in the client spec (`UI-Architecture-and-Layout.md` `{kind:landing}`) |
| Gallery | per-character image grid | ABSENT | MODERATE | per-user CAS backend exists; a Phase-6 `@orb/ui` surface (v2 curation since landed — see the feature map) |
| Image-gen in chat (txt2img portrait/"selfie") | SD ext generate-from-chat | ABSENT | MODERATE | the `generateImage` role exists (hosted); chat caller since landed (see the feature map) |
| Expressions / sprites | emotion classifier → sprite swap (+ live2d/VRM) | ABSENT | ARCHITECTURAL | needs a classify/vision role + the dropped VN compositor + a per-turn hook; committed D49, PD-56, [`../proposed/expressions.md`](../proposed/expressions.md) |
| Backgrounds (app background image) | set an app/chat-chrome background image | DEFERRED-CHEAP (D49) | TRIVIAL | **was wrongly rated PAINFUL** — it's app-chrome theming, NOT the VN scene-compositor. A D44 `ThemeOverride.background` token (`AssetRef\|ExternalUrl` + `fit`), per-user global + per-chat lock, via `<ThemeScope>` (never raw `url()`). Home: `UI-Theming-and-Content.md` + [`../proposed/themes-design.md`](../proposed/themes-design.md) |
| Audio / BGM / blip sounds | scene/char music + typing blips | ABSENT | PAINFUL | player is trivial; "which track for this scene" needs new persistence + VN coupling |
| TTS (text-to-speech) | \~30 providers + narrate pipeline | ABSENT | ARCHITECTURAL | a new inference role **and** a streaming-audio transport (SSE is text/JSON) + turn hook |
| STT (speech-recognition) | voice input | ABSENT | ARCHITECTURAL | new audio-in transport + role |
| Dynamic custom CSS + rich HTML cards + inline media | per-char/chat CSS, stat-block HTML, inline images/audio/video | **ADDRESSED** | — | **resolved in `UI-Theming-and-Content.md` §12 (D44)** — token-override Tier A (safe, zero injection) + sandboxed-iframe Tier B for raw HTML/CSS; media via `MessageMedia` + `forbidExternalMedia`. The earlier PAINFUL/security-conflict framing is **superseded** |
| UI themes / moving-UI | drag-reposition panels + themes | BY-DESIGN-OUT | N/A / MODERATE | container-driven layout (`UI-Architecture-and-Layout.md`) replaces moving-UI; theming maps onto DTCG tokens if wanted |
| Server thumbnails / animated-image detect | thumbnail gen + isAnimated | ABSENT | MODERATE | needed at scale by gallery/backgrounds; check `infra/image` coverage |

**Gotcha:** everything per-message (expressions, TTS-narrate, SD-in-chat, BGM auto-switch) hooks the chat turn lifecycle. Sprites/backgrounds/BGM together are effectively rebuilding the presentation subsystem the remake removed.

## 3. Scripting & extensibility

**Addressed by D46 — committed record: [`../proposed/automation.md`](../proposed/automation.md)** (authoritative build designs: `../proposed/automation-design/` Tier 1 + `../proposed/plugin-design/` Tier 2). Not re-litigated here. Where the ST surface lands:

| Feature | What it is (ST) | Status | Where addressed |
| - | - | - | - |
| Macros (`{{…}}`) | substitution engine | COVERED (+DX gap) | `kit/macro` exists; DX layer + CEL committed (D46) |
| Variables (local) | per-chat var bag | COVERED | delta-fold on the chat variant plane (D46 seam) |
| Variables (global) | cross-chat vars | committed | per-user `fetchOwned` KV (D46) |
| Regex scripts | find/replace engine | COVERED | `kit/regex` exists |
| Quick Reply | event→script buttons | committed | Tier 1 (declarative automation) |
| STscript (imperative: `/while`, closures, pipes) | the slash-command language | committed | Tier 2 (QuickJS sandbox, dual-mode) |
| Slash-command set (\~289 cmds) | command dispatch | committed | Tier 1 actions + Tier 2 host API |
| Third-party extensions (`getContext()` god-object) | dynamic-import plugins | committed (re-architected) | Tier 2 (capability-manifest membrane) — **the ST model is BY-DESIGN-OUT** |
| `setExtensionPrompt`/`/inject` | runtime prompt injection at depth | PARTIAL | `kit/injection` exists; a Tier-1 action seam |
| The client event bus | `eventSource`/`event_types` | ABSENT | replaced by the D50 `PromptTransform` seam + Tier-1 triggers |

## 4. Data ingestion & RAG-auxiliary

orbweaver rebuilt the vector substrate (embeddings/search/memory) but it is **canon-derived** — every vector row is a pure function of chat/character/asset canon. An uploaded *document* is not derivable from canon (it **is** canon), which is why the Data Bank class needs a parallel doc-store, not a graft.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
| - | - | - | - | - |
| token-counter panel | count tokens of pasted text | ABSENT | TRIVIAL | a count verb over the providers tokenizer + a panel |
| Translate | per-message + auto translation | ABSENT | MODERATE | a `summarize`-style request-shaper over the `chat` role; no new backends |
| Caption (standalone, ad-hoc) | "describe this image" → text | PARTIAL | MODERATE | the vision call runs inside the embeddings indexer; needs a user-facing ad-hoc verb |
| Scrapers | web/file/youtube/wiki → Data Bank | ABSENT | MODERATE | simple fetchers, but **homeless without a Data Bank target** |
| Web Search RAG | live search → inject results | ABSENT | MODERATE–PAINFUL | per-turn live ingestion; no orb seam |
| Server doc text-extraction | pdf/docx/epub/html → text | ABSENT | MODERATE | a real sub-feature any Data Bank needs (vendored lib in a loader) |
| Attachments / Data Bank | per-chat/char/global file banks + doc RAG | DECIDED-BUILD (D49) | ARCHITECTURAL | additive graft, P6/7: a single-owned `documents` producer + derived `document_chunks` + per-type FK scope junctions + chunker + db-free extraction loader. [`../proposed/databank.md`](../proposed/databank.md), FLAG\[PD-57] |
| Vectors as file-RAG | chunk+embed+retrieve uploaded files | ABSENT | PAINFUL | embed/search plumbing reuses; the producer/canon shape doesn't fit (needs the doc-store above) |
| assets ext (community downloader) | download chars/extensions/audio from a repo index | ABSENT | N/A | no extension system, no marketplace, no ambient-audio concept; the "download a character from URL" sliver = import-from-URL |
| **Already covered** (do not re-add) | chat-memory vectorization (→ memory/embeddings/search); image-captioning *capability* (inline in the indexer); RAG retrieval machinery (embed/space/exact-scan/rerank/threshold); bulk profile import (`import` domain) | COVERED | — | |

## 5. Generative media & tools

| Feature / sub-feature | ST reality | Status | Difficulty | Note / home |
| - | - | - | - | - |
| Hosted image-gen (text→image) | DALLE/Stability/Flux via API | RESERVED→done | TRIVIAL | the `generateImage` role is fully wired (hosted-only, D39) |
| Image-gen in chat flow | generate→store→render as message | ABSENT | MODERATE | role exists; chat caller + `domain/imagery` since landed (see the feature map) |
| Local SD backends (A1111/ComfyUI/Horde/sdcpp/drawthings/…) | 20+ local sources | ABSENT | ARCHITECTURAL | each is a new credential SOURCE re-opening the firewall axis; D39 made image-gen hosted-only on purpose |
| Portrait/prompt-template modes (CHARACTER/FACE/SCENARIO/BACKGROUND) | LLM-extract → generate | ABSENT | MODERATE | a chat-domain two-step (extract→generate) atop the working role |
| Inpainting / img2img | mask/init-image | ABSENT | MODERATE | `ImageGenerateRequest` is text→image only; contract widening + backend support |
| `/imagine` slash surface | 4 commands | ABSENT | MODERATE | Phase-6 client command surface |
| Tool/function calling — agent-sdk path | recursive multi-tool loop | COMMITTED (D47) | MODERATE | `createAgentToolServer` seam + reserved `toolCalls` col; the SDK owns the loop. One registry w/ the OpenAI path (D48) |
| Tool/function calling — chat-completions/responses path | OpenAI-style tools + recurse | COMMITTED (D48) | MODERATE | the "PAINFUL/fights stateless-turn" framing is RESOLVED — the `tool` role lands on the WIRE axis + the **chat DOMAIN owns the recurse loop** (not infra). Gates landed. [`../proposed/tool-use.md`](../proposed/tool-use.md), PD-54 |
| Reasoning data + streaming + resolve | native reasoning handling | COVERED | — | `message_variants.reasoning`/effort + `STREAM_DELTA_KINDS` + `resolve-chat.resolveReasoning` (D41) |
| Reasoning `<think>` auto-parse (non-native models) | parse inline tags | ABSENT | MODERATE | a parse step in the chat turn (since landed: `server/kit/reasoning`) |
| Reasoning UI render / effort picker | collapsible blocks + effort UI | ABSENT (deferred) | MODERATE | data exists; Phase-6 client |
| Vision / image INPUT (image→model) | `image_url` content parts | **COMMITTED (D45)** | born-compliant before Phase 5 | `ModelCapability.input.vision` axis (the gate) + `ChatHistoryMessage.content` `string`→content-parts; sealed translators map image parts. Landed in contracts before Phase 5 as planned |
| Structured-output via tools (`tool_choice:{type:tool}`) | forced JSON | COMMITTED (D48) | MODERATE | a SEPARATE `response_format` axis (not via `tool_choice`); `ModelCapability.output.structured` gate landed. [`../proposed/tool-use.md`](../proposed/tool-use.md) |

## 6. Deliberately OUT by design (not gaps to "fix")

Rejected by a decision or the constitution — recorded so a cold agent doesn't "restore" them:

- **ST's third-party extension model** (`getContext()` god-object + dynamic-import of unvetted code) — negates resolver-enforced boundaries. The *capability* is re-architected (D46 Tier 2 membrane); the ST *mechanism* is permanently out.
- **Raw text-completion backends + instruct-mode + CFG + sampler-ordering** — orbweaver is OpenAI-wire / agent-session only; the text-completion protocol path is not a feature, it's a second architecture.
- **The tokenizer zoo** — `kit/tokens` rejects per-model tokenizers; provider `usage` is the source of truth.
- **Global/shared (cross-user) state** — anything ST stores app-wide is either per-user (single-owned) or doesn't exist; there is no global tier (D21).
- **Community marketplace / asset downloader** — no app-store at self-hosted single-operator scale.
- **Per-char/chat arbitrary CSS** — conflicts with the token/containment gates + the "no leaks" threat model.

## 7. The shape of it — cheap wins vs big lifts

**Cheap / fits existing seams (MODERATE or less):** direct model providers (clean D39), sysprompt library, logprobs, translate, standalone caption, gallery, image-gen-in-chat, portrait modes, welcome screen, token-counter, tool-loop on agent-sdk, reasoning `<think>` parse.

**Big lifts / need a subsystem (PAINFUL/ARCHITECTURAL):** any text-completion backend (Horde/NAI/Kobold), expressions/sprites, TTS/STT, the Data Bank doc-store, local SD backends, backgrounds/BGM (VN layer).

**The pre-Phase-5 "now window" — CLOSED, both resolved as planned:** (1) the message-content block union + `MessageMedia` display model landed (`UI-Theming-and-Content.md` §12.3–12.4, D44) and vision INPUT landed born-compliant (D45: `ModelCapability.input.vision` + `ChatHistoryMessage.content` content-parts in `@orb/contracts`); (2) tool-calling ownership was decided before the pipeline was built — the chat DOMAIN owns the recurse loop (D48); the loop itself is the remaining Phase-5 chunk (PD-54).

## 8. Cross-references

- Scripting/automation/variables/macro/STscript: D46 → [`../proposed/automation.md`](../proposed/automation.md).
- Ownership categories + the no-global-tier + image/asset decisions: ledger D18 / D20 / D21 / D23.
- Sealed backends + adding a source (the D39 template) + roles firewall: `Tier-3b-Providers.md`, D39.
- Reserved columns/roles: D37 (`toolCalls`), D39 (`generateImage`), D41 (reasoning/warnings).
- Constitution + the cake + gates: `Core-0-Architecture-and-Structure.md`.
- **Current build status per feature:** [`Core-SillyTavern-Feature-Map.md`](Core-SillyTavern-Feature-Map.md) (wins on status).
