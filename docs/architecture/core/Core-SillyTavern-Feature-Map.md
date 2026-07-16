---
kind: reference
status: active
updated: 2026-07-13
---

# Core — SillyTavern Feature Slot Map (the one clear reference)

> **Purpose.** ONE place that says, for every SillyTavern feature orbweaver committed to: which decision commits it, its PD flag, its home, and whether it's built yet. It reconciles the ledger (`Core-Laws-and-Precedents.md` D44–D63), the runbook (`Core-BUILD-PLAN.md`), and the PD registry (`Core-Audits-and-Debt.md`).
>
> **Authority:** the ledger D-entry wins on a *decision* conflict; the PD registry (`Core-Audits-and-Debt.md`) wins on *build status*; this doc is the reconciled map, verified against the code + file tree 2026-07-13.
>
> **OWNERSHIP:** this doc = the reconciled ST→orbweaver build MAP (how each ST feature maps); the Gap-Register = the CLOSED D49 inventory with dispositions — rows live THERE, the map summarizes.
>
> **The closed-inventory rule (D49):** the ST feature set is FROZEN. Every ST feature orbweaver would ever build is below or in [`Core-ST-Feature-Gap-Register.md`](Core-ST-Feature-Gap-Register.md). **Do not re-audit ST or propose a feature without a row.**
>
> **Not a to-do board.** A `STILL-GAP` row names the staging program that owns it or says `unscheduled`. The ONLY live UI work board is [`../proposed/ui-cohesion-north-star.md`](../proposed/ui-cohesion-north-star.md). Unscheduled future design sets are parked in `../proposed/` (see `../proposed/INDEX.md`) (D66).

## 1. Build status at a glance

**Phase spine:** `kit → contracts → db → server → client`, chat + memory LAST.
**Today (2026-07-13):** Phases 0–5 BUILT (the whole chat/memory/roster engine, tool loop included). Phase 6 client: L0–L6 shell landed; remaining UI owned by the north-star. Phase 7: `imagery`, gallery v1/v2, `tool-use`, `hub`, direct providers BUILT; `databank`/`expressions`/`roster-preset` reserved (schema born, runners stubbed). Phase 8 (scripting/plugin) not started.

**Status legend:** `BUILT` (shipped) · `RESERVED` (born-compliant schema/contract seam in-tree, impl deferred) · `STILL-GAP` (not built; names its staging owner or `unscheduled`) · `OUT` (by-design rejected, D47/D49 — never build).

## 2. The master table

### 2a. ST features BUILT (core domains / kit — Phases 1–5)

ST-derived but built as first-class core, not "ST ports."

| Feature | Home | Status |
| - | - | - |
| World info / lorebooks | `@orb/kit/world-info` + `@orb/contracts/world-info` + `domain/world-info` | BUILT |
| Personas | `@orb/kit/persona` + `domain/persona` | BUILT |
| Presets | `domain/preset` | BUILT |
| Character cards | `domain/character` (flat live card, D28) | BUILT |
| Tags | `domain/tag` (per-type FK junctions, D24) | BUILT |
| Macros | `@orb/kit/macro` (isomorphic; above ST on correctness) | BUILT |
| Regex scripts | `@orb/kit/regex` + `@orb/server/kit/regex` (`node:vm` ReDoS watchdog) + chat wiring (D53) | BUILT |
| Variables | `domain/chat` — ChoiceBlock config plane + variable map + macro `setvar` BUILT; the runtime per-variant delta-fold (D46) is owned by the automation staging program | BUILT (config plane); delta-fold staged (automation) |
| Group chat / roster | `domain/chat` (roster + arbitration + two-axis gen, D16) | BUILT |
| Memory / summarization | `domain/chat/memory` (D16) | BUILT |
| Embeddings / vector search | `domain/embeddings` + `domain/search` | BUILT (card/image; memory consumer arms = PD-34/35, blocked:audit) |
| Image-generation IN CHAT (the chat **caller**) | D47 #1 — `domain/chat` verb → `MessageMedia` (orchestrator = `domain/imagery`, §2d) | BUILT |
| Reasoning `<think>` auto-parse | D47 #3 — `server/kit/reasoning` (`parseReasoningTags`) wired in the engine pipeline | BUILT |

### 2b. Tool-calling — the last Phase-5 seam, now closed

| Feature | Decision | PD | Home | Status |
| - | - | - | - | - |
| OpenAI-path tool **recurse loop** | D48 | PD-54 | `domain/chat` owns the loop — `runRecurseLoop` in `engine/pipeline.ts`; registry `domain/tool-use` | BUILT (PD-54 closed 2026-07-04) |

### 2c. Phase 6 — client UIs (D42/D44/D47/D49/D63)

| Feature | Decision | Home | Status |
| - | - | - | - |
| Welcome screen | D47 #7 | `chat/surfaces/chat-landing-surface.tsx` (hero + recent chats + quick-pick) | BUILT |
| Reasoning render + effort picker | D47 #3 / D41 | `chat/components/reasoning-block.tsx` + `preset/…/params-panel.tsx` ReasoningSection | BUILT |
| Gallery **v1** grid | D49 #2 | client over the assets gallery verbs | BUILT (v2 curation too — §2d) |
| Token-counter | D49 #2 | split across the character editor: per-facet counts in `character/components/character-facet-inspector.tsx`, card totals in `character/surfaces/character-editor-surface.tsx` (via `totalTokenCount`/`permanentTokenCount`) | PARTIAL — standalone paste-text panel unscheduled |
| Inline image display | D44 | `@orb/ui` `MessageMedia` + `chat/components/message-media-block.tsx` | BUILT |
| `/imagine` command surface | D46 | a Tier-1 automation action; backend `chat.generateImage` exists, no client command surface | STILL-GAP — automation staging |
| **Background** image | D44 / D63 | base surface COLOR = `ThemeOverride.background` token; decorative IMAGE = `appearance` settings via `<ThemeBackgroundLayer>` (D63) | BUILT |
| Rich HTML cards + custom CSS | D44 | `@orb/ui` token-override (Tier A) + `content/sandbox-frame` null-origin iframe (Tier B) | BUILT |

### 2d. Phase 7 — committed feature DOMAINS (post-chat grafts)

| Domain | Decision | PD | What it is | Status |
| - | - | - | - | - |
| `domain/imagery` | D49 #1 | **PD-93** | server orchestrator: injected `generatePicture` op (hosted-only `generateImage`, D39) + assets CAS → `MessageMedia` | BUILT (`verbs/generate-picture.ts`; img2img/image-studio cluster deferred — imagery staging) |
| gallery **v2** | D49 #2 | PD-55 | curated per-character media: `"gallery"` AssetKind + `gallery_items` table + assets verbs (`list-gallery`, `add/remove-to-gallery`) | BUILT |
| `domain/tool-use` | D48 | PD-54 | the ONE tool registry, two wire projections; the chat domain owns the recurse loop (§2b) | BUILT |
| `domain/hub` | D61 | — | character import from chub/wyvern/chartavern/pygmalion + gif search, via sealed `HubAdapter` registry behind the egress guard | BUILT |
| Direct model providers | D47 #4 | — | native provider keys — a clean D39 source-add | BUILT (Anthropic-direct backend; OpenAI/Google storable, resolver arm reserved) |
| `domain/databank` | D49 #5 | PD-57 | document-RAG: `documents` producer + `document_chunks` vectors + extraction loader + `{{databank}}` slot | RESERVED — schema born (`db/schema/databank.ts`), ingest runner stubbed; databank staging |
| `domain/expressions` | D49 #4 | PD-56 | `classify` role + `character_sprites` + `EXPRESSION_LABELS` + per-turn chat hook | RESERVED — contract + `character_sprites` schema born, runner stubbed; expressions staging |
| Translate | D47 #5 | — | a request-shaper over the `chat` role (like summarize) | STILL-GAP — unscheduled |
| Standalone caption | D47 #6 | — | an ad-hoc user-facing vision verb (the capability runs inside the embeddings indexer) | STILL-GAP — unscheduled |

### 2e. Phase 8 — scripting / automation / plugin (D46)

Not started. Tier-1 automation is contract-only (`@orb/contracts/automation`); the design sets are parked in `../proposed/` (see its `INDEX.md`).

| Piece | Home / staging owner |
| - | - |
| Tier-1 declarative automation | `@orb/contracts/automation` landed (trigger tuples); `domain/automation` staged (automation-design) |
| Tier-2 plugin sandbox | `infra/plugin-host` (QuickJS-WASM) + `domain/plugin` — staged (plugin-design) |
| Macro-DX + CEL + global vars | `@orb/kit/macro` DX layer + `@marcbachmann/cel-js` + a `fetchOwned` KV table — staged (automation-design) |
| Prompt-transform seam | an ordered `PromptTransform` on the turn pipeline (D50) — NOT a bus subscription — staged |

## 3. Explicitly NOT a domain (folds into existing systems)

- **Background** → base surface COLOR is a `ThemeOverride.background` token; the decorative IMAGE is FLAT `appearance` user-settings (D63: `backgroundImageKind`/`backgroundSeededId`/`backgroundExternalUrl`/`fit`/`dim`), applied once at the app root via `<ThemeBackgroundLayer>` — never a domain, never the VN scene-compositor.
- **Gallery v1** → assets read verbs + a client grid. (v2 curation DID land a `gallery_items` table — §2d.)
- **Token-counter** → pure client over `@orb/kit/tokens`.

## 4. By-design OUT (D47/D49 — do NOT build, do NOT re-propose)

Text-completion backends (AI Horde / NovelAI / KoboldAI-classic / raw-textgen / instruct-mode / CFG / sampler-ordering), the tokenizer zoo, local Stable-Diffusion backends, the community marketplace, TTS/STT (deferred-heavy — a new inference role + audio transport), and the VN scene-compositor (scene backgrounds / BGM).

## 5. Drift corrections (frozen)

The 2026-07-01/03 "drift this map corrects" ledger (imagery PD-93-not-54, the removed `proposed/<x>/` dirs, the build-plan PD over-list, the marinara adjudication, the PD-registry lag) is fully absorbed into the code + the PD registry. Frozen in [`../history/st-feature-map-archaeology-record.md`](../history/st-feature-map-archaeology-record.md) §2. On any status disagreement, trust the code, then the PD registry.

## 6. Cross-refs

- **Decisions:** `Core-Laws-and-Precedents.md` D44 (theming/content) · D45 (vision input) · D46 (scripting/automation) · D47 (7 ST gaps) · D48 (tool-calling) · D49 (closed inventory) · D50 (event bus / prompt-transform) · D51 (multimodal wire seam) · D52 (ECharts) · D53 (regex) · D61 (hub / roster-preset) · D63 (background image = appearance).
- **Order + phase state:** `Core-BUILD-PLAN.md`.
- **Debt / build status:** `Core-Audits-and-Debt.md` — PD-54/55/56/57/93 (the feature-domain flags).
- **Parked design sets** (in `../proposed/`, see `../proposed/INDEX.md`): `../proposed/{automation,databank,expressions,plugin,imagery,tool-use,hub-browse,rpg}-design/` — mapped by [`../proposed/README.md`](../proposed/README.md).
- **Gap register (the full ST inventory + dispositions):** [`Core-ST-Feature-Gap-Register.md`](Core-ST-Feature-Gap-Register.md).
