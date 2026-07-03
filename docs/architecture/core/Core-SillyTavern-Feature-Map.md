---
kind: reference
status: active
updated: 2026-07-03
---

# Core — SillyTavern Feature Slot Map (the one clear reference)

> **Purpose.** ONE place that says, for every SillyTavern feature orbweaver committed to: which decision commits it, which build phase it lands in, its PD flag, its home, and whether it's built yet. It reconciles the ledger (`Core-Laws-and-Precedents.md` D44–D53), the runbook (`Core-BUILD-PLAN.md`), the committed feature docs, and the PD registry (`Core-Audits-and-Debt.md`).
>
> **Authority:** the ledger D-entry wins on a *decision* conflict; this doc wins on *cross-reference / status* drift (verified against the actual code + file tree, last 2026-07-03). Known drifts it corrects: [§5](#5-drift-this-map-corrects-read-if-a-source-disagrees).
>
> **The closed-inventory rule (D49):** the ST feature set is FROZEN. Every ST feature orbweaver would ever build is below or in [`Core-ST-Feature-Gap-Register.md`](Core-ST-Feature-Gap-Register.md). **Do not re-audit ST or propose a feature without a row.**

## 1. Build status at a glance

**Phase spine:** `kit → contracts → db → server → client`, chat + memory LAST.
**Today (2026-07-03):** Phases 0–5 BUILT (the whole chat/memory/roster engine included). One Phase-5 seam open: the D48 OpenAI-path tool loop. Phase 6 (client) in progress; Phase 7 PARTIAL (`domain/imagery` + gallery landed early); Phase 8 pending.

**Status legend:** `BUILT` (shipped) · `OPEN-P5` (the one remaining chat-engine seam) · `COMMITTED` (committed doc exists; work is Phase 6/7/8) · `OUT` (by-design rejected, D47/D49 — never build).

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
| Variables | `domain/chat` — ChoiceBlock config plane + variable map + macro `setvar` BUILT; the two-plane per-variant delta-fold (D46) is **IN PROGRESS** (a separate build session, parked until the docs pass lands) | BUILT (config plane); delta-fold WIP |
| Group chat / roster | `domain/chat` (roster + arbitration + two-axis gen, D16) | BUILT |
| Memory / summarization | `domain/chat/memory` (D16) | BUILT |
| Embeddings / vector search | `domain/embeddings` + `domain/search` | BUILT (card/image; memory consumer arms = PD-34/35, blocked:audit) |
| Image-generation IN CHAT (the chat **caller**) | D47 #1 — `domain/chat` verb → `MessageMedia` (orchestrator = `domain/imagery`, §2d) | BUILT |
| Reasoning `<think>` auto-parse | D47 #3 — `server/kit/reasoning` (`parseReasoningTags`) wired in the engine pipeline | BUILT |

### 2b. The one OPEN Phase-5 seam

| Feature | Decision | PD | Home | Status |
| - | - | - | - | - |
| OpenAI-path tool **recurse loop** | D48 | PD-54 | `domain/chat` (stateless backends can't loop); `engine/pipeline.ts` marks it the next chunk. Capability gates + the `ToolCallRecord` DTO/column landed; wire fields ship with the loop | OPEN-P5 |

### 2c. Phase 6 — client UIs (D42/D44/D47/D49)

| Feature | Decision | Home | Status |
| - | - | - | - |
| Welcome screen | D47 #7 | `@orb/client` `{kind:landing}` | COMMITTED |
| Reasoning render + effort picker | D47 #3 / D41 | client | COMMITTED |
| Gallery **v1** grid | D49 #2 | client over `assets.listOwned` (no new server domain) | COMMITTED |
| Token-counter panel | D49 #2 | pure client over `@orb/kit/tokens` | COMMITTED |
| Inline image display | D44 | `@orb/ui` `MessageMedia` | primitive BUILT (`ui/content/message-media`); chat surface COMMITTED |
| `/imagine` command surface | D46 | a Tier-1 automation action (client surface) | COMMITTED |
| **Background** image | D44 / D49 #3 | a `ThemeOverride.background` **token** via `<ThemeScope>` — **NOT a domain** | COMMITTED |

### 2d. Phase 7 — committed feature DOMAINS (post-chat grafts)

| Domain | Decision | PD | Phase | What it is | Status |
| - | - | - | - | - | - |
| `domain/imagery` | D49 #1 | **PD-93** | 7 | server orchestrator: injected `generatePicture` op (hosted-only `generateImage`, D39) + assets CAS → `MessageMedia` | BUILT (landed early; registry row lags — see §5.5) |
| gallery **v2** | D49 #2 | PD-55 | 7 | curated per-character media: `"gallery"` AssetKind + `gallery_items` table + `domain/assets` verbs | BUILT (landed early; registry row lags — see §5.5) |
| `domain/tool-use` | D48 | PD-54 | 7 (registry) | the ONE tool registry, two wire projections. *The recurse loop itself is Phase 5 (§2b)* | COMMITTED |
| `domain/databank` | D49 #5 | PD-57 | 7 (6/7) | document-RAG: `documents` producer + `document_chunks` vectors + `infra/extraction` + `{{databank}}` slot | COMMITTED |
| `domain/expressions` | D49 #4 | PD-56 | 7 | `classify` role + `character_sprites` + `EXPRESSION_LABELS` + per-turn chat hook | COMMITTED |
| Direct model providers | D47 #4 | — | 7 | native Anthropic/OpenAI/Google keys — a clean D39 source-add | COMMITTED |
| Translate | D47 #5 | — | 7 | a request-shaper over the `chat` role (like summarize) | COMMITTED |
| Standalone caption | D47 #6 | — | 7 | an ad-hoc vision verb (pairs with D45) | COMMITTED |

### 2e. Phase 8 — scripting / automation / plugin (D46)

All COMMITTED, none built.

| Piece | Home |
| - | - |
| Tier-1 declarative automation | `domain/automation` + `@orb/contracts/automation` |
| Tier-2 plugin sandbox | `infra/plugin-host` (QuickJS-WASM) + `domain/plugin` |
| Macro-DX + CEL + global vars | `@orb/kit/macro` DX layer + `@marcbachmann/cel-js` + a `fetchOwned` KV table |
| Prompt-transform seam | an ordered `PromptTransform` on the turn pipeline (D50) — NOT a bus subscription |

## 3. Explicitly NOT a domain (folds into existing systems)

- **Background** → a D44 `ThemeOverride.background` token (§2c). *Corrects the gap-register's original "resurrects the VN layer" rating.*
- **Gallery v1** → a `listOwned` read verb on `domain/assets` + a client grid. No new domain/table. (v2 curation DID land a table — §2d.)
- **Token-counter** → pure client over `@orb/kit/tokens`. Zero server.

## 4. By-design OUT (D47/D49 — do NOT build, do NOT re-propose)

Text-completion backends (AI Horde / NovelAI / KoboldAI-classic / raw-textgen / instruct-mode / CFG / sampler-ordering), the tokenizer zoo, local Stable-Diffusion backends, the community marketplace, TTS/STT (deferred-heavy — a new inference role + audio transport), and the VN scene-compositor (scene backgrounds / BGM).

## 5. Drift this map corrects (read if a source disagrees)

Verified against the code + file tree (2026-07-01, re-verified 2026-07-03):

1. **imagery's PD flag: use `PD-93`, not `PD-54`.** Ledger D49 #1 and Core-BUILD-PLAN §7.1 both tag imagery `FLAG[PD-54]` — but **PD-54 is `tool-use`** in the registry, and **PD-93 is imagery**. The `PD-54` on imagery is copy-paste stale; PD-93 is authoritative.
2. **The `proposed/<x>/` research dirs are GONE.** Every "Promoted from `proposed/image-studio/` … `expression-stage/` … `media-surfaces/` … `databank/` … `tool-use/`" ref (in the ledger, the build plan, and doc status banners) is a dangling path — removed after promotion. There is no `domains/proposed/` either. The committed decision records now live at `../proposed/{automation,databank,expressions,gallery,tool-use}.md` (+ their `*-design/` sets); built domains (imagery, gallery) have no doc — the code is the doc.
3. **Core-BUILD-PLAN §Phase-5 over-lists "PD cleared by this phase."** It names PD-19/20/28/31/46 (and others) as chat-phase work — but those are already in the `## Cleared` set. Cross-check the PD registry, not the build plan's inline list.
4. **Marinara is NOT ST and NOT in this map's closed inventory — but it is now fully adjudicated elsewhere.** The RPG engine is COMMITTED (D58, `../proposed/rpg-design/`); the non-RPG borrows are decided (D59/D61). The evidence record is [`../proposed/Marinara-Residue-Non-RPG.md`](../proposed/Marinara-Residue-Non-RPG.md) (the former `Marinara-Feature-Slot-Map` was folded into it; full text in git history). Nothing marinara awaits re-mining.
5. **The PD registry lags the early Phase-7 landings:** PD-93 (imagery) and PD-55 (gallery v2) still read "not built (deferred)" while `domain/imagery` and `gallery_items` + the assets gallery verbs are in the tree. Trust the code.

## 6. Cross-refs

- **Decisions:** `Core-Laws-and-Precedents.md` D44 (theming/content) · D45 (vision input) · D46 (scripting/automation) · D47 (7 ST gaps) · D48 (tool-calling) · D49 (closed inventory) · D50 (event bus / prompt-transform) · D51 (multimodal wire seam) · D52 (ECharts) · D53 (regex).
- **Order:** `Core-BUILD-PLAN.md` Phases 5–8.
- **Committed feature docs:** `../proposed/{automation,databank,expressions,gallery,tool-use}.md`.
- **Debt:** `Core-Audits-and-Debt.md` — PD-54/55/56/57/93 (the feature-domain flags).
- **Gap register (the full ST inventory + dispositions):** [`Core-ST-Feature-Gap-Register.md`](Core-ST-Feature-Gap-Register.md).
