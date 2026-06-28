# Orbweaver — SillyTavern feature-gap register

> **Status: REFERENCE / inventory (not a plan).** This is the catalog of SillyTavern (ST) features that
> orbweaver does NOT currently have, each tagged with its real add-back cost, so a cold agent (or Nate)
> can make scope calls without re-auditing ST from scratch. It is the evidence base behind any "should we
> add X?" decision. It is **not** a commitment to build any of these — committed scripting/automation work
> lives in `proposals/scripting-automation-extensibility.md`; everything else here is un-decided unless a
> ledger D-entry says otherwise.
>
> **Provenance:** compiled 2026-06-28 from a source-level audit (5 parallel agents reading ST's real
> `public/scripts/**` + orbweaver's `packages/**` + docs). Difficulty ratings are grounded in orbweaver's
> actual seams, not guesses.
>
> **Cold-read orientation:** orbweaver is a maximal-rigor remake of *neo-tavern*, itself a remake of *ST*.
> **The lineage matters:** neo already cut ST down to a focused chat/character/memory engine, so most of
> these gaps were created at the **ST→neo** step and orbweaver simply inherited the narrowed scope — they
> are not new orbweaver deletions. Constitution: the package cake `kit ← contracts ← db ← server ← client`,
> sealed provider backends, two ownership categories (D18/D23), no extension/scripting runtime. See
> `structure.md` + `reports/DECISIONS-LEDGER.md`.

---

## Legend

**Status** — `ABSENT` (not in orbweaver) · `PARTIAL` (capability exists, surface/wiring missing) ·
`RESERVED` (a born-compliant column/seam exists, feature deferred) · `COVERED` (orbweaver does an
equivalent, listed for completeness) · `BY-DESIGN-OUT` (deliberately rejected by a decision/constitution).

**Add-back difficulty** —
- `TRIVIAL` — a thin surface over an existing seam.
- `MODERATE` — normal feature work; fits existing patterns (a domain verb, a request-shaper, a client surface).
- `PAINFUL` — small code wrapped around new persistence, a dropped subsystem, or a gate/security conflict.
- `ARCHITECTURAL` — needs a subsystem orbweaver doesn't have (a protocol path, an inference role, an audio
  transport, a sandbox/scripting runtime) — or conflicts with the constitution.
- `N/A` — recommend never (no product fit / superseded by an orbweaver decision).

---

## 1. Inference backends & sampling

The wall behind most of this: orbweaver speaks **`ChatApi = agent-sdk | chat-completions | responses`** —
all OpenAI-shaped messages/agent-session protocols. It has **no raw text-completion path** and no
instruct-style prompt-assembly. Anything text-completion is not "add a source" (the D39 template only fits
OpenAI/Anthropic-wire backends) — it needs a 4th protocol axis + an assembly subsystem the design rejects.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
|---|---|---|---|---|
| AI Horde | crowdsourced volunteer-GPU, async job-poll, text-completion | ABSENT | ARCHITECTURAL | new `ChatApi` (async-poll) + text-completion assembly; `deriveRunner` has no non-SSE arm |
| NovelAI | proprietary text-completion wire, NAI samplers, NerdStash tokenizer | ABSENT | ARCHITECTURAL | non-OpenAI wire + tokenizer-zoo (a decided wall) |
| KoboldAI (classic) | raw `/generate`, `sampler_order`, text-completion | ABSENT | ARCHITECTURAL | text-completion wall. (Modern KoboldCpp in OpenAI mode is covered by `custom_openai`) |
| textgen family (ooba/aphrodite/tabby/llama.cpp/ollama/togetherai/…) | ~15 backends + ~60 samplers | PARTIAL | MODERATE (compat) / ARCHITECTURAL (raw) | OpenAI-compat members **already covered** by `custom_openai`/`vllm`; only raw-text-completion members hit the wall |
| Direct model providers (native Anthropic/OpenAI/Google keys, not via OpenRouter) | direct chat-completion sources | ABSENT | MODERATE | the **clean D39 case**; `CRED_PROVIDERS` already reserves `anthropic\|openai\|google_vertex` slots |
| instruct-mode + context templates | wraps turns into one completion string | ABSENT | ARCHITECTURAL | no text-completion runner to feed; structurally rejected |
| sysprompt library | named, macro-substituted system prompts | ABSENT | MODERATE | preset/settings CRUD; `systemPrompt {static,dynamic}` + `kit/macro` already exist |
| CFG scale | negative-prompt + guidance_scale | ABSENT | ARCHITECTURAL | only text-completion/NAI honor it; OpenAI wire has no `guidance_scale` |
| logprobs display | per-token probability viz | ABSENT | MODERATE | chat-completions/responses carry `top_logprobs`; **not** agent-sdk; display-only |
| sampler select / ordering | reorder `sampler_order`/priority | ABSENT | ARCHITECTURAL (PAINFUL via passthrough) | a raw-textgen concept; survives only as an untyped `customParameters` blob |
| logit bias | per-token bias | PARTIAL | MODERATE | `UserIntent.logitBias` contract + firewall gate exist; needs UI + a real tokenizer for bias-by-word |
| tokenizer zoo | per-model tokenizers (tiktoken/LLaMA/NerdStash/…) | BY-DESIGN-OUT | ARCHITECTURAL | `kit/tokens` deliberately rejects the zoo (decided); truth = provider `usage`. Only token-id features need it |
| grammar / JSON-schema constrained output | `json_schema`/`response_format` | ABSENT | MODERATE–PAINFUL | no structured-output seam in `UserIntent`/runners; OR + compat servers support it |
| exotic samplers (DRY, XTC, mirostat, dynatemp, top_a, TFS, typical_p, smoothing…) | textgen sampler set | PARTIAL | MODERATE (per-knob) | ride `customParameters` today (no UI); first-class = a contract cascade per knob |

**Gotcha:** `custom_openai` + `customParameters` already silently cover much of the textgen world; don't
rebuild ollama/tabby/llama.cpp-server as named sources (that's a `no-inline-union-redecl` doubling).

---

## 2. Presentation & multimedia (the "visual novel" layer neo dropped)

Mostly client (Phase 6, unbuilt). Several resurrect the VN scene compositor orbweaver removed, or need an
inference role that doesn't exist.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
|---|---|---|---|---|
| Welcome screen | landing: recent/pinned chats | ABSENT | TRIVIAL→MODERATE | already the reference example in the client spec (`client.md` `{kind:landing}`) |
| Gallery | per-character image grid | ABSENT | MODERATE | per-user CAS backend exists; a Phase-6 `@orb/ui` surface |
| Image-gen in chat (txt2img portrait/"selfie") | SD ext generate-from-chat | ABSENT | MODERATE | the `generateImage` role exists (hosted); needs a Phase-5 chat caller |
| Expressions / sprites | emotion classifier → sprite swap (+ live2d/VRM) | ABSENT | ARCHITECTURAL | needs a classify/vision role + the dropped VN compositor + a per-turn hook |
| Backgrounds | chat scene background image | ABSENT | PAINFUL | resurrects the VN scene layer + a new shell slot + per-chat persistence |
| Audio / BGM / blip sounds | scene/char music + typing blips | ABSENT | PAINFUL | player is trivial; "which track for this scene" needs new persistence + VN coupling |
| TTS (text-to-speech) | ~30 providers + narrate pipeline | ABSENT | ARCHITECTURAL | a new inference role **and** a streaming-audio transport (SSE is text/JSON) + Phase-5 hook |
| STT (speech-recognition) | voice input | ABSENT | ARCHITECTURAL | new audio-in transport + role |
| Dynamic custom CSS + rich HTML cards + inline media | per-char/chat CSS, stat-block HTML, inline images/audio/video | **ADDRESSED** | — | **resolved in `client.md` §12 (D44)** — token-override Tier A (safe, zero injection) + sandboxed-iframe Tier B for raw HTML/CSS; media via `MessageMedia` + `forbidExternalMedia`. The earlier PAINFUL/security-conflict framing is **superseded** |
| UI themes / moving-UI | drag-reposition panels + themes | BY-DESIGN-OUT | N/A / MODERATE | container-driven layout (`client.md`) replaces moving-UI; theming maps onto DTCG tokens if wanted |
| Server thumbnails / animated-image detect | thumbnail gen + isAnimated | ABSENT | MODERATE | needed at scale by gallery/backgrounds; check `infra/image` coverage |

**Gotcha:** everything per-message (expressions, TTS-narrate, SD-in-chat, BGM auto-switch) hooks the
Phase-5 chat turn lifecycle — none can land before chat exists. Sprites/backgrounds/BGM together are
effectively rebuilding the presentation subsystem the remake removed.

---

## 3. Scripting & extensibility

**Addressed in `proposals/scripting-automation-extensibility.md`** — not re-litigated here. Summary of the
ST surface and where it lands:

| Feature | What it is (ST) | Status | Where addressed |
|---|---|---|---|
| Macros (`{{…}}`) | substitution engine | COVERED (+DX gap) | `kit/macro` exists; DX layer committed (proposal §3.4) |
| Variables (local) | per-chat var bag | COVERED | proposal §3 (delta-fold) |
| Variables (global) | cross-chat vars | committed | proposal §3.3 (per-user `fetchOwned`) |
| Regex scripts | find/replace engine | COVERED | `kit/regex` exists |
| Quick Reply | event→script buttons | committed | proposal Tier 1 (declarative automation) |
| STscript (imperative: `/while`, closures, pipes) | the slash-command language | committed | proposal Tier 2 (QuickJS sandbox, dual-mode) |
| Slash-command set (~289 cmds) | command dispatch | committed | proposal Tier 1 actions + Tier 2 host API |
| Third-party extensions (`getContext()` god-object) | dynamic-import plugins | committed (re-architected) | proposal Tier 2 (capability-manifest membrane) — **the ST model is BY-DESIGN-OUT** |
| `setExtensionPrompt`/`/inject` | runtime prompt injection at depth | PARTIAL | `kit/injection` exists; a Tier-1 action seam |
| The client event bus | `eventSource`/`event_types` | ABSENT | the substrate Tier-1 triggers need (proposal §5) |

---

## 4. Data ingestion & RAG-auxiliary

orbweaver rebuilt the vector substrate (embeddings/search/memory) but it is **canon-derived** — every
vector row is a pure function of chat/character/asset canon. An uploaded *document* is not derivable from
canon (it **is** canon), which is why the Data Bank class needs a parallel doc-store, not a graft.

| Feature | What it is (ST) | Status | Difficulty | Note / home |
|---|---|---|---|---|
| token-counter panel | count tokens of pasted text | ABSENT | TRIVIAL | a count verb over the providers tokenizer + a panel |
| Translate | per-message + auto translation | ABSENT | MODERATE | a `summarize`-style request-shaper over the `chat` role; no new backends |
| Caption (standalone, ad-hoc) | "describe this image" → text | PARTIAL | MODERATE | the vision call runs inside the embeddings indexer; needs a user-facing ad-hoc verb |
| Scrapers | web/file/youtube/wiki → Data Bank | ABSENT | MODERATE | simple fetchers, but **homeless without a Data Bank target** |
| Web Search RAG | live search → inject results | ABSENT | MODERATE–PAINFUL | per-turn live ingestion; no orb seam |
| Server doc text-extraction | pdf/docx/epub/html → text | ABSENT | MODERATE | a real sub-feature any Data Bank needs (vendored lib in a loader) |
| Attachments / Data Bank | per-chat/char/global file banks + doc RAG | ABSENT | ARCHITECTURAL | new domain + a **canon producer table** + a 5th embedding source-kind + a new search lens + a chunker |
| Vectors as file-RAG | chunk+embed+retrieve uploaded files | ABSENT | PAINFUL | embed/search plumbing reuses; the producer/canon shape doesn't fit (needs the doc-store above) |
| assets ext (community downloader) | download chars/extensions/audio from a repo index | ABSENT | N/A | no extension system, no marketplace, no ambient-audio concept; the "download a character from URL" sliver = import-from-URL |

**Already covered (listed so they're not re-added):** chat-memory vectorization (→ memory/embeddings/
search, improved), image-captioning *capability* (inline in the indexer), the RAG retrieval machinery
(embed/space/exact-scan/rerank/threshold), bulk profile import (`import` domain).

---

## 5. Generative media & tools

| Feature / sub-feature | ST reality | Status | Difficulty | Note / home |
|---|---|---|---|---|
| Hosted image-gen (text→image) | DALLE/Stability/Flux via API | RESERVED→done | TRIVIAL | the `generateImage` role is fully wired (hosted-only, D39) |
| Image-gen in chat flow | generate→store→render as message | ABSENT | MODERATE | role exists; needs a Phase-5 chat verb + asset store + render |
| Local SD backends (A1111/ComfyUI/Horde/sdcpp/drawthings/…) | 20+ local sources | ABSENT | ARCHITECTURAL | each is a new credential SOURCE re-opening the firewall axis; D39 made image-gen hosted-only on purpose |
| Portrait/prompt-template modes (CHARACTER/FACE/SCENARIO/BACKGROUND) | LLM-extract → generate | ABSENT | MODERATE | a chat-domain two-step (extract→generate) atop the working role |
| Inpainting / img2img | mask/init-image | ABSENT | MODERATE | `ImageGenerateRequest` is text→image only; contract widening + backend support |
| `/imagine` slash surface | 4 commands | ABSENT | MODERATE | Phase-6 client command surface |
| Tool/function calling — agent-sdk path | recursive multi-tool loop | PARTIAL | MODERATE | `createAgentToolServer` seam exists; needs a domain tool-registry + loop + persist to the reserved `toolCalls` col |
| Tool/function calling — chat-completions/responses path | OpenAI-style tools + recurse | ABSENT | PAINFUL | no `tools`/`tool_choice` request fields, no tool-delta events, no `tool` history role; fights the stateless-turn model |
| Reasoning data + streaming + resolve | native reasoning handling | COVERED | — | `message_variants.reasoning`/effort + `STREAM_DELTA_KINDS` + `resolve-chat.resolveReasoning` (D41) |
| Reasoning `<think>` auto-parse (non-native models) | parse inline tags | ABSENT | MODERATE | a parse step in the chat turn |
| Reasoning UI render / effort picker | collapsible blocks + effort UI | ABSENT (deferred) | MODERATE | data exists; Phase-6 client (Streamdown checkpoint) |
| Vision / image INPUT (image→model) | `image_url` content parts | ABSENT | PAINFUL→ARCHITECTURAL | `ChatHistoryMessage.content` is `string`; content-parts ripples through all 3 sealed translators + assembly + storage + a `ModelCapability` vision flag |
| Structured-output via tools (`tool_choice:{type:tool}`) | forced JSON | ABSENT | MODERATE | no constrained-decoding/JSON-schema field |

**Reserved-progress (born-compliant, partially in place):** `generateImage` role (done, hosted-only) ·
`message_variants.toolCalls` column (reserved, D37 — exec loop not built) · reasoning fields (done; UI +
`<think>` auto-parse left).

---

## 6. Deliberately OUT by design (not gaps to "fix")

These are rejected by a decision or the constitution — record them so a cold agent doesn't "restore" them:

- **ST's third-party extension model** (`getContext()` god-object + dynamic-import of unvetted code) —
  negates resolver-enforced boundaries. The *capability* is re-architected in the scripting proposal
  (Tier 2 membrane); the ST *mechanism* is permanently out.
- **Raw text-completion backends + instruct-mode + CFG + sampler-ordering** — orbweaver is OpenAI-wire /
  agent-session only; the text-completion protocol path is not a feature, it's a second architecture.
- **The tokenizer zoo** — `kit/tokens` rejects per-model tokenizers; provider `usage` is the source of truth.
- **Global/shared (cross-user) state** — anything ST stores app-wide is either per-user (single-owned) or
  doesn't exist; there is no global tier (D21).
- **Community marketplace / asset downloader** — no app-store at self-hosted single-operator scale.
- **Per-char/chat arbitrary CSS** — conflicts with the token/containment gates + the "no leaks" threat model.

---

## 7. The shape of it — cheap wins vs big lifts

**Cheap / fits existing seams (MODERATE or less):** direct model providers (clean D39), sysprompt library,
logprobs, translate, standalone caption, gallery, image-gen-in-chat, portrait modes, welcome screen,
token-counter, tool-loop on agent-sdk, reasoning `<think>` parse. Defer freely; add when wanted.

**Big lifts / need a subsystem (PAINFUL/ARCHITECTURAL):** any text-completion backend (Horde/NAI/Kobold),
expressions/sprites, TTS/STT, the Data Bank doc-store, local SD backends, vision *input*
(`ChatHistoryMessage.content` reshape), the chat-completions tool loop, backgrounds/BGM (VN layer).

**The two with a *now* window** (cheap before Phase 5, painful after — flagged because the chat substrate
is built whole):
1. **Image DISPLAY in chat (send/receive/show + external-URL links)** — the actual want; **COVERED** by the
   render model in `client.md` §12.3–12.4 (`MessageMedia` + a `media` block + `forbidExternalMedia`). The
   message-content block union + `MessageMedia` are the only before-Phase-5 born-compliant bits, and they're
   cheap/additive (they don't touch the send wire). **Vision INPUT to the model** (the model *sees* an
   attached image) is a *separate, OPTIONAL* capability — NOT required for display and NOT being built; if
   ever wanted, the `ChatHistoryMessage.content` → content-parts widening is cheapest before Phase 5
   (client.md §12.4). A reservation, not a requirement.
2. **Tool-calling on the OpenAI path** — decide agent-sdk-only (cheap, seam exists) vs must-work-on-
   chat-completions (needs the `tool` role in `ChatHistoryMessage` + loop ownership) before the turn
   pipeline is built.

---

## 8. Cross-references
- Scripting/automation/variables/macro/STscript: `proposals/scripting-automation-extensibility.md`.
- Ownership categories + the no-global-tier + image/asset decisions: ledger D18 / D20 / D21 / D23.
- Sealed backends + adding a source (the D39 template) + roles firewall: `tiers/providers.md`, D39.
- Reserved columns/roles: D37 (`toolCalls`), D39 (`generateImage`), D41 (reasoning/warnings).
- Constitution + the cake + gates: `structure.md`.
