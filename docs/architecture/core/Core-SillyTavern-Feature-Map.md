# Core — SillyTavern Feature Slot Map (the one clear reference)

> **Purpose.** ONE place that says, for every SillyTavern feature orbweaver committed to: which decision
> commits it, which build phase it lands in, its PD flag, its home, and whether it's built yet. It
> reconciles four sources that had drifted apart — the ledger (`Core-Laws-and-Precedents.md` D44–D53),
> the runbook (`Core-BUILD-PLAN.md`), the domain docs (`domains/*.md`), and the PD registry
> (`Core-Audits-and-Debt.md`).
>
> **Authority:** the ledger D-entry wins on a *decision* conflict; this doc wins on *cross-reference /
> status* drift (it was written last, against the actual code + file tree, 2026-07-01). Known drifts it
> corrects are listed in [§5](#5-drift-this-map-corrects-read-if-a-source-disagrees).
>
> **The closed-inventory rule (D49):** the ST feature set is FROZEN. Every ST feature orbweaver would
> ever build is below or in the gap register. **Do not re-audit ST or propose a feature without a row.**

---

## 1. Build status at a glance

**Phase spine:** `kit → contracts → db → server → client`, chat + memory LAST.
**Today (2026-07):** Phases 0–4 built; **Phase 5 (chat) almost complete**; Phases 6/7/8 are parallel
post-chat tracks (priority order, not a hard chain).

**Status legend used below:**
- 🟢 **BUILT** — shipped (Phases 1–4, or the chat-coupled bits inside Phase 5).
- 🟡 **IN P5** — lands *with* chat because it hooks the turn lifecycle (Phase 5, in progress).
- 🔵 **COMMITTED, not built** — a committed domain doc exists; work is Phase 6/7/8.
- ⚫ **OUT** — by-design rejected (D47/D49). Never build.

---

## 2. The master table

### 2a. ST features already BUILT (core domains / kit — Phases 1–5)

These are ST-derived but were built as first-class core, not "ST ports."

| Feature | Home | Status |
| --- | --- | --- |
| World info / lorebooks | `@orb/kit/world-info` + `@orb/contracts/world-info` + `domain/world-info` | 🟢 BUILT |
| Personas | `@orb/kit/persona` + `domain/persona` | 🟢 BUILT |
| Presets | `domain/preset` | 🟢 BUILT |
| Character cards | `domain/character` (flat live card, D28) | 🟢 BUILT |
| Tags | `domain/tag` (per-type FK junctions, D24) | 🟢 BUILT |
| Macros | `@orb/kit/macro` (isomorphic; above ST on correctness) | 🟢 BUILT |
| Regex scripts | `@orb/kit/regex` + `@orb/server/kit/regex` (`node:vm` ReDoS watchdog) + chat wiring (D53) | 🟢 BUILT |
| Variables (two-plane) | `domain/chat` — ChoiceBlock config plane + per-variant delta fold (D46 seam) | 🟡 IN P5 |
| Group chat / roster | `domain/chat` (roster + arbitration + two-axis gen, D16) | 🟡 IN P5 (near done) |
| Memory / summarization | `domain/chat/memory` (D16) | 🟡 IN P5 |
| Embeddings / vector search | `domain/embeddings` + `domain/search` | 🟢 BUILT (card/image; memory arms = PD-34/35) |

### 2b. Chat-coupled ST features — land INSIDE Phase 5 (D47/D48)

They hook the turn lifecycle, so they ship *with* the engine, not as a later graft.

| Feature | Decision | PD | Home | Status |
| --- | --- | --- | --- | --- |
| Image-generation IN CHAT (the chat **caller**) | D47 #1 | — | `domain/chat` verb → `MessageMedia` (orchestrator = `imagery`, Phase 7) | 🟡 IN P5 |
| Reasoning `<think>` auto-parse | D47 #3 | — | chat turn parse step (fields exist, D41) | 🟡 IN P5 |
| OpenAI-path tool **recurse loop** | D48 | PD-54 | `domain/chat` (stateless backends can't loop) | 🟡 IN P5 |

### 2c. Phase 6 — client UIs (D42/D44/D47/D49)

| Feature | Decision | Home | Status |
| --- | --- | --- | --- |
| Welcome screen | D47 #7 | `@orb/client` `{kind:landing}` | 🔵 |
| Reasoning render + effort picker | D47 #3 / D41 | client | 🔵 |
| Gallery **v1** grid | D49 #2 | client over `assets.listOwned` (no new server domain) | 🔵 |
| Token-counter panel | D49 #2 | pure client over `@orb/kit/tokens` | 🔵 |
| Inline image display | D44 | `@orb/ui` `MessageMedia` | 🔵 |
| `/imagine` command surface | D46 | a Tier-1 automation action (client surface) | 🔵 |
| **Background** image | D44 / D49 #3 | a `ThemeOverride.background` **token** via `<ThemeScope>` — **NOT a domain** | 🔵 |

### 2d. Phase 7 — committed feature DOMAINS (post-chat grafts)

All COMMITTED (domain docs exist), **none built yet**.

| Domain | Decision | PD | Phase | What it is |
| --- | --- | --- | --- | --- |
| `domain/imagery` | D49 #1 | **PD-93** | 7 | server orchestrator: inject `generateImage` (hosted-only, D39) + prompt-extract + assets CAS → `MessageMedia`. |
| `domain/tool-use` | D48 | PD-54 | 7 (registry) | the ONE tool registry, two wire projections. *The recurse loop itself is Phase 5.* |
| `domain/databank` | D49 #5 | PD-57 | 7 (6/7) | document-RAG: `documents` producer + `document_chunks` vectors + `infra/extraction` + `{{databank}}` slot. |
| `domain/expressions` | D49 #4 | PD-56 | 7 | `classify` role + `character_sprites` + `EXPRESSION_LABELS` + per-turn chat hook. |
| gallery **v2** | D49 #2 | PD-55 | 7 | curated per-character media: `"gallery"` AssetKind + `gallery_items` table. (v1 is Phase 6, above.) |
| Direct model providers | D47 #4 | — | 7 | native Anthropic/OpenAI/Google keys — a clean D39 source-add. |
| Translate | D47 #5 | — | 7 | a request-shaper over the `chat` role (like summarize). |
| Standalone caption | D47 #6 | — | 7 | an ad-hoc vision verb (pairs with D45). |

### 2e. Phase 8 — scripting / automation / plugin (D46)

| Piece | Home | Status |
| --- | --- | --- |
| Tier-1 declarative automation | `domain/automation` + `@orb/contracts/automation` | 🔵 |
| Tier-2 plugin sandbox | `infra/plugin-host` (QuickJS-WASM) + `domain/plugin` | 🔵 |
| Macro-DX + CEL + global vars | `@orb/kit/macro` DX layer + `@marcbachmann/cel-js` + a `fetchOwned` KV table | 🔵 |
| Prompt-transform seam | an ordered `PromptTransform` on the turn pipeline (D50) — NOT a bus subscription | 🔵 |

---

## 3. Explicitly NOT a domain (folds into existing systems)

- **Background** → a D44 `ThemeOverride.background` token (§2c). *Corrects the stale gap-register
  "Backgrounds — resurrects the VN layer" row.*
- **Gallery v1** → a `listOwned` read verb on `domain/assets` + a client grid. No new domain/table.
- **Token-counter** → pure client over `@orb/kit/tokens`. Zero server.

## 4. By-design OUT (D47/D49 — do NOT build, do NOT re-propose)

Text-completion backends (AI Horde / NovelAI / KoboldAI-classic / raw-textgen / instruct-mode / CFG /
sampler-ordering), the tokenizer zoo, local Stable-Diffusion backends, the community marketplace,
TTS/STT (deferred-heavy — a new inference role + audio transport), and the VN scene-compositor (scene
backgrounds / BGM).

## 5. Drift this map corrects (read if a source disagrees)

Verified against the code + file tree 2026-07-01:

1. **imagery's PD flag: use `PD-93`, not `PD-54`.** Ledger D49 #1 and Core-BUILD-PLAN §7.1 both tag
   imagery `FLAG[PD-54]` — but **PD-54 is `tool-use`** in the registry, and **PD-93 is imagery**. The
   `PD-54` on imagery is a copy-paste stale; PD-93 is authoritative.
2. **The `proposed/<x>/` source dirs are GONE.** Every "Promoted from `proposed/image-studio/` …
   `expression-stage/` … `media-surfaces/` … `databank/` … `tool-use/` … `scripting-automation-extensibility/`"
   ref (in the ledger, the build plan, and the six domain-doc status banners) is a **dangling path** —
   those research dirs were removed after promotion to `domains/*.md`. There is **no `domains/proposed/`**
   either (Core-BUILD-PLAN §7 preamble points at it). Treat the committed `domains/*.md` as the source of
   truth; ignore the `proposed/…` breadcrumbs.
3. **Core-BUILD-PLAN §Phase-5 over-lists "PD cleared by this phase."** It names PD-19/20/28/31/46 (and
   others) as chat-phase work — but those are already in the `## Cleared` set. Cross-check the PD registry,
   not the build plan's inline list, for what's actually open. (See also the registry's own
   [Bucket B re-verification](Core-Audits-and-Debt.md#bucket-b--chat-landed-re-verification-2026-07-01).)
4. **The RPG engine (`domain/rpg`) and everything else from marinara are NOT in this map and NOT
   committed.** Marinara is a separate external app (not SillyTavern, not neo-tavern), so D49's closed ST
   inventory doesn't cover it — but nothing commits it either. The RPG engine, marinara's 21-agent set,
   and its generative borrows are all **proposed, each needing its own ledger decision**, mapped onto
   phases in [`../proposed/Marinara-Feature-Slot-Map.md`](../proposed/Marinara-Feature-Slot-Map.md). Do
   not build or schedule any of it without a new ledger entry.

---

## 6. Cross-refs

- **Decisions:** `Core-Laws-and-Precedents.md` D44 (theming/content) · D45 (vision input) · D46 (scripting/
  automation) · D47 (7 ST gaps) · D48 (tool-calling) · D49 (closed inventory) · D50 (event bus / prompt-
  transform) · D51 (multimodal wire seam) · D52 (ECharts) · D53 (regex).
- **Order:** `Core-BUILD-PLAN.md` Phases 5–8.
- **Domain docs:** `domains/{imagery,tool-use,databank,expressions,gallery,automation}.md` (committed).
- **Debt:** `Core-Audits-and-Debt.md` — PD-54/55/56/57/93 (the feature-domain flags).
- **Gap register (the full ST inventory + dispositions):** `Core-Legacy-Migration-and-Gaps.md`.
