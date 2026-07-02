# Marinara RPG Engine — Legacy Analysis & Port Reference

> **⇒ This is the executive summary. The exhaustive, reverse-engineered backing lives in
> [`rpg/`](rpg/README.md)** — state model, per-endpoint flow spines, the 26-service inventory, the
> 86-type catalog, the generative pipeline, sub-engines, and the port map. Read this for the shape;
> read the corpus for the detail.
>
> **Status: research / port-planning.** This is the seed document for a future `domain/rpg`
> (no `domains/rpg.md` exists yet). It maps what the legacy **Marinara Engine** RPG system actually
> does, so we can port the worthwhile mechanics into Orbweaver's one-directional flow without
> dragging in the god-object sprawl.
>
> **Verification:** every structural claim below was checked against the marinara source at
> `references/marinara-engine` using `ts-morph` (real symbol resolution) and `ast-grep`. File paths,
> line-anchored constants, export names, and counts are confirmed. A running list of the errors this
> pass corrected from the prior (Gemini-authored) draft is in the [Corrections](#corrections-applied-from-the-prior-draft)
> appendix — the short version: no fields were hallucinated, but schemas were silently truncated,
> a few symbols were misattributed to the wrong file, and internal helpers were presented as public API.
>
> **Scope note:** the prior draft also covered sprites/backgrounds/gallery. Those already have
> **committed** domain docs — [`domains/expressions.md`](../domains/expressions.md),
> [`domains/imagery.md`](../domains/imagery.md), [`domains/gallery.md`](../domains/gallery.md) (all D49/D47,
> Phase 7). This doc defers to them and does **not** re-specify them; see
> [§6 Adjacent systems](#6-adjacent-systems-owned-by-other-docs). The unique payload here is the RPG engine.

---

## 1. The one thing that matters (the architectural verdict)

Marinara's RPG loop is **client-orchestrated**: the UI is the master sequencer. To build a single
game turn the client fires multiple blocking LLM calls at different endpoints and stitches the
results together itself:

```
1. client → POST /generate      (wait)   main narration
2. client → POST /game/scene-wrap (wait)  standalone LLM completion → JSON for HUD/music/visuals
3. client → POST /game/party-turn (wait)  standalone LLM completion → NPC companion dialogue
```

Each of those endpoints independently rebuilds connection context, model limits, prompt strings, and
its own structured-output parsing. There is no shared assembly pipeline — the "turn" is an emergent
property of the client calling things in the right order.

**Orbweaver inverts this to server-driven.** The client calls `POST /chat` once and is done. Anything
out-of-band (a director pass, a lorebook-keeper, a scene analysis) is a **Workload** the server drops
onto the async queue; it wakes, does its own LLM call, mutates the DB, and never blocks the turn or
requires the client to sequence anything. Structured side-effects (move party, update a HUD widget,
change music, generate an image) become **MCP tool calls** the model emits inside the one turn —
not bespoke endpoints returning regex-scraped JSON. RPG state is collected in the **GATHER** phase of
the chat assembly pipeline and slotted deterministically in **BUILD**, rather than concatenated ad-hoc
in a GM-prompt builder.

Everything else in this document is detail supporting that inversion.

---

## 2. The sprawl, quantified (why this can't be ported as-is)

Measured, not estimated:

| Metric | Value | How measured |
| --- | --- | --- |
| `game.routes.ts` size | **8,659 lines / 347 KB** (one file) | `wc` |
| Registered endpoints in that one file | **41** | `ast-grep` on `app.{get,post,put,patch,delete}` |
| Distinct symbols it imports | **147**, via 60 import statements | `ts-morph` import graph |
| Distinct source dirs/packages it reaches into | **22** | `ts-morph`, grouped |
| Out-of-band LLM completion call-sites **in that file alone** | **13** (11 `runGameChatComplete` + 2 `runGameChatStream`) | `ast-grep` |
| `services/game/` footprint | **26 files, 7,559 lines, 160 exported symbols** | `ts-morph` |
| Files importing `game-state.storage.ts` | 9 | `ts-morph` reverse-deps |

> Note: the "347 KB" and "8,600-line" figures in the prior draft are the **same file measured two
> ways**, not two facts.

`game.routes.ts` violates every tier boundary at once: HTTP transport, Drizzle queries, storage
instantiation, prompt construction, LLM orchestration, and image generation all live in the same
handlers. This is the single largest structural liability in the port.

**State is untyped-at-rest.** Game state (weather, time, maps, party inventory, reputation, HUD
widgets) is serialized into JSON blobs in `chats.metadata` and the `game-state.storage.ts` repo, with
no schema enforcement at the DB boundary — hence the `parseMeta` / `parseJsonField` / normalize-*
calls scattered through nearly every endpoint (see the [endpoint appendix](#appendix-endpoint-inventory)).

---

## 3. The deterministic-server / narrative-LLM split (the good idea to keep)

The load-bearing design principle worth porting verbatim: **the server owns all math and rules; the
LLM only narrates.** Mechanics are resolved deterministically server-side, and the final outcomes are
injected into the GM prompt as facts to be described. The model never rolls dice or arbitrates rules.

Verified world/combat logic (`packages/server/src/services/game/`, line-anchored):

- **Time** (`time.service.ts`) — action → clock advance. Confirmed constants: `explore: 30` (minutes),
  `rest_long: 480` (= 8h). Deterministic, no tokens spent.
- **Weather** (`weather.service.ts`) — biome + season heuristics (`inferBiome`, `generateWeather`,
  `shouldWeatherChange`); deterministic.
- **Perception** (`perception.service.ts`) — passive score `10 + WIS mod + Perception stat`; on beating
  a danger-table threshold it injects up to two `<clue>` XML tags into the GM context for the model to
  weave in organically.
- **Combat** (`combat.service.ts`) — D20 initiative, effective-speed turn order, flat defense
  mitigation, level scaling. `resolveCombatRound` is the round loop.
- **Elemental reactions** (`element-reactions.service.ts`) — an "aura gauge" system with swappable
  presets (Genshin / Honkai-style); reactions resolved server-side before narration.
- **Loot** (`loot.service.ts`) — difficulty-weighted drop tables, rolled server-side. Confirmed the
  brutal-tier table: `brutal: { common: 20, uncommon: 25, rare: 30, epic: 18, legendary: 7 }`.
- **Reputation & morale** (`reputation.service.ts`) — tracked `-100..100`; the LLM emits
  `[reputation: npc="Guard" action="attacked"]` tags, the server applies the math and fires milestones
  on tier crossings.

**GM prompt construction** (`gm-prompts.ts`) splits context by recency bias: long-term world state
(`<weather_update>`, `<party_morale>`, `<story_arc_secret>`) goes into the **system prompt**; strict
format rules + current HUD state go into the **final user message** ("Format Reminder") to force
compliance. This ad-hoc concatenation is exactly what the GATHER/BUILD phases replace.

---

## 4. Data model (schemas — pointers, not re-paste)

The prior draft pasted these interfaces inline and **truncated every one of them**. Rather than repeat
that, here is the authoritative source map. Read the files; don't trust a paste.

| Type(s) | File | Notes |
| --- | --- | --- |
| `GameState`, `PresentCharacter`, `CharacterStat`, `PlayerStats`, `RPGAttributes`, `CustomTrackerField` | `packages/shared/src/types/game-state.ts` | The per-swipe state blob. **Do not omit `swipeIndex`** (state is keyed per swipe, not per message), `temperature`, `committed`, `manualOverrides`, `fieldLocks` — these carry the tracker-lock / manual-override semantics and were dropped in the prior draft. |
| `GameMap`, `GameCampaignPlan`, `GameCheckpoint`, `HudWidget`, `HudWidgetType`, `CheckpointTrigger`, `CombatSummary` | `packages/shared/src/types/game.ts` | `HudWidgetType` has **8** members (`progress_bar, gauge, relationship_meter, counter, stat_block, list, inventory_grid, timer`). `CheckpointTrigger` has **7** (`manual, session_start, session_end, combat_start, combat_end, location_change, auto_interval`). `CombatSummary` lives here, **not** in `combat-encounter.ts`. |
| `RPGStatsConfig`, `RPGStatPool` | `packages/shared/src/types/character.ts` | Character-card baseline: `{ enabled, attributes: {name,value}[], hp: {value,max}, pools? }`. Instanced into `GameState.playerStats` at session start. |
| `CombatAttack`, `CombatMechanic`, + **21 other** `Combat*`/`Encounter*` interfaces | `packages/shared/src/types/combat-encounter.ts` | The encounter sidecar's full contract (23 interfaces total). The prior draft showed 2. |

**Structural fact worth carrying into the port:** these are hand-written TS interfaces with **no Zod
schemas** and no DB-boundary validation. State round-trips through `JSON.stringify` into
`chats.metadata`. A clean `domain/rpg` should define contract schemas at the persistence boundary
(the thing marinara never did) — this is where the "fragile parser checks scattered everywhere" pain
comes from.

---

## 5. The subsystems worth porting

### 5.1 Combat encounter sidecar
A separate, heavily-structured turn-based combat modal (`combat-encounter.ts` types +
`encounter.routes.ts`, 805 lines). While `GameState` tracks overworld HP, the encounter engine runs its
own initiative/cooldown/boss-mechanic loop and, on conclusion, injects a `CombatSummary` (from
`game.ts`) back into the main chat to resume roleplay. **Port target:** a sealed encounter subsystem
under `domain/rpg`, entered/exited via verbs, never touching the route layer.

### 5.2 Scene branching
`scene.ts` + `scene.routes.ts` (870 lines). The model authors a `SceneFullPlan` (hidden `scenario`,
custom `systemPrompt`, player `participationGuide`); the chat forks into a bubble, plays out, and on
`/scene/conclude` a summary merges back into the main `GameState` timeline. **Port target:** a
fork/merge verb pair on `domain/rpg` (or `domain/chat`, TBD) — the fork is a first-class chat concept,
not an RPG-only one.

### 5.3 The structured-output polyfill (local-model support)
Marinara predates native JSON-mode/tool-calling on the local models it targets, so it leans on
"prompt-and-pray" structured output with aggressive repair. Two real files:

- **`services/llm/textual-tool-call-parser.ts`** — exported entry point **`parseTextualToolCalls`**
  (the prior draft never named it). Hunts `<|tool_call|>`, `<tool_code>`, ` ```json ` fences, and
  model-specific quirks (Gemma delimiters, Llama `<|python_tag|>`); wraps unquoted keys in quotes on
  the fly.
- **`services/game/jsonish.ts`** — exported API is **`parseGameJsonish`** and **`jsonishLooksTruncated`**.
  The names the prior draft advertised (`insertMissingPropertyCommas`, `closeUnbalancedJsonish`,
  `unwrapJsonString`) are **internal, non-exported helpers** — real, but not the interface. Auto-repair:
  guesses missing commas, strips hallucinated C-style comments, and `closeUnbalancedJsonish` reverses a
  bracket-depth stack to glue closers onto truncated generations. `unwrapJsonString` (double-escaped
  recovery) lives **here**, not in the parser file the prior draft attributed it to.
- **Hard-fail path:** when repair fails, the server throws and the client opens a manual "JSON Repair"
  modal — a human fixes the model's brackets before the turn proceeds. (Grep for the repair-error
  emitter `sendJsonRepairError` / `buildJsonRepairPayload`, wired across most game endpoints.)

**Port stance:** Orbweaver's Tier-1 models use the born-compliant tool-use seams
([`domains/tool-use.md`](../domains/tool-use.md), D47/D48). But this repair logic should port into
`infra/providers/` as a **Tier-3b local-model polyfill** so local providers can participate in
`domain/rpg` workloads without a hard-fail modal. Do not delete it; relocate it.

### 5.4 The Claude-subscription firewall (verified — port the pattern)
`services/llm/providers/claude-subscription.provider.ts` runs roleplay through the user's local
`claude` CLI auth (Pro/Max sub) to avoid per-token cost, using the SDK purely as a text endpoint. The
isolation config is real and line-anchored:

- `tools: []` (l.402), `skills: []` (l.403), `maxTurns: 1` (l.404)
- `ENABLE_CLAUDEAI_MCP_SERVERS: "false"` (l.441)

**Session-state injection is real:** `ResumeSessionStore` (`claude-subscription/session-store.ts:39`,
`implements SessionStore` from `@anthropic-ai/claude-agent-sdk`) is a one-shot in-process store that
feeds synthesized JSONL history to the stateful SDK so it adopts the current chat timeline before a
stateless-per-turn generation. This is the same firewall concept `domain/buddy` and the sealed agent
runner already formalize — cross-reference, don't reinvent.

---

## 6. Adjacent systems (owned by other docs)

The prior draft specified these here; they are already committed elsewhere. Defer:

| System | Legacy | Owner doc |
| --- | --- | --- |
| Sprites / expressions | `sprites.routes.ts` (1,999 lines / 75 KB) | [`domains/expressions.md`](../domains/expressions.md) (D49) |
| Backgrounds / scene imagery | `backgrounds.routes.ts` (469 lines) | [`domains/imagery.md`](../domains/imagery.md) (D47) |
| Emojis / stickers / gifs | `custom-emojis` / `custom-stickers` / `gifs.routes.ts` | [`domains/gallery.md`](../domains/gallery.md) (D49) |

The only RPG-relevant hook: marinara's `/game/generate-assets` and `/game/scene-wrap` call into image
generation **out-of-band and inline** in the route. In Orbweaver that becomes an MCP `generateImage`
tool call dropping a `MessageMedia` block into the chat log (D47) — the RPG domain requests imagery,
it does not host it.

### Deferred / out-of-scope entirely
- **Media (Spotify/YouTube)** — ambient agents controlling playback → future `domain/media`, event-bus/tool-driven, never blocking a turn.
- **Haptics** (`haptic.routes.ts`, 107 lines) — teledildonics sync → future `domain/haptics`.
- **Bot-browsers** — **six** files (`bot-browser.routes.ts` + `-wyvern`, `-pygmalion`, `-janny`,
  `-datacat`, `-chartavern`), external card-hub scrapers. The prior draft said "five (Chub, Janny)";
  it is six, and none is named `chub`. → future external-sync domain.
- **Admin sidecars** (`professor-mari-workspace`, `sidecar`) — replaced by Orbweaver's Phase 8 automation/plugin system.

---

## 7. Port target summary

| Marinara subsystem | Orbweaver target | Mechanism |
| --- | --- | --- |
| `game.routes.ts` (41 endpoints) | `domain/rpg` verbs + thin tRPC shim | 8-slot template; DB isolated to `persistence/` |
| Client-sequenced `/scene-wrap`, `/party-turn` | Server-driven **Workloads** | async queue, no client stitching |
| Bespoke JSON-return endpoints (HUD/music/move) | **MCP tools** in the one turn | model emits tool calls; no regex scrape |
| `gm-prompts.ts` ad-hoc concatenation | **GATHER → BUILD** chat-pipeline phases | deterministic slotting into MacroContext/system prompt |
| `jsonish.ts` + `textual-tool-call-parser.ts` | `infra/providers/` **Tier-3b polyfill** | relocate, don't delete |
| Untyped `chats.metadata` blobs | `domain/rpg` contract schemas at the persistence boundary | validate at the DB edge |
| Combat / encounter / scene | sealed subsystems under `domain/rpg` | verb-entered, route-free |

---

## Corrections applied (from the prior draft)

Caught via `ts-morph`/`ast-grep`. No fields were *invented* — the failure mode was truncation and
misattribution, which is exactly what hides in a hand-review:

1. **`game.routes.ts` "347 KB" vs "8,600 lines"** presented as separate facts — same file.
2. **`HudWidgetType`** shown with 5 members; real type has **8** (missing `stat_block`, `list`, `timer`).
3. **`CheckpointTrigger`** shown with 5; real type has **7** (missing `session_end`, `combat_end`).
4. **`GameState`** paste dropped `swipeIndex`, `temperature`, `committed`, `manualOverrides`,
   `fieldLocks`, `createdAt` — including the architecturally load-bearing per-swipe key and tracker locks.
5. **`unwrapJsonString`** attributed to `textual-tool-call-parser.ts`; it is in `jsonish.ts`.
6. **`CombatSummary`** attributed to `combat-encounter.ts`; it is in `game.ts`.
7. **`jsonish.ts` "API"** listed internal non-exported helpers; the real exports are `parseGameJsonish`
   and `jsonishLooksTruncated`.
8. **`textual-tool-call-parser.ts`** entry point `parseTextualToolCalls` was never named.
9. **Bot-browsers**: "five (Chub, Janny)" → six files, no `chub`.
10. **Sprites/backgrounds/gallery** re-specified despite committed owner docs — demoted to pointers.
11. **D47/D49** loosely paraphrased as "strip AI from the UI"; tightened to what they actually commit
    (D47 = agent-sdk tool-calling + `generateImage`-as-chat-verb + `MessageMedia`; D49 = expressions/gallery full scope).
12. **Part 4 raw AST dump** (escaped-newline garbage, unreadable) replaced with the clean appendix below.

---

## Appendix: endpoint inventory

`game.routes.ts` registers **41** endpoints (ast-grep verified). Grouped by concern — this replaces the
prior draft's raw function-call dump. Endpoints marked ⚡ make out-of-band LLM completions; 🖼 hit image
generation inline.

- **Session lifecycle:** `POST /setup/apply-json` ⚡, `POST /start`, `POST /session/start` ⚡,
  `POST /session/conclude` ⚡, `.../apply-json`, `POST /session/regenerate-lorebook` ⚡,
  `POST /session/lorebook-keeper/apply-json`, `POST /session/regenerate-conclusion` ⚡, `.../apply-json`,
  `POST /session/update-campaign-progression` ⚡, `.../apply-json`, `GET /:gameId/sessions`
- **Party:** `POST /party/recruit` ⚡, `POST /party/remove`, `POST /party-turn` ⚡
- **Mechanics (deterministic):** `POST /dice/roll`, `POST /skill-check`, `POST /morale`,
  `POST /combat/round`, `POST /combat/loot`, `POST /loot/generate`, `POST /encounter/roll`,
  `POST /reputation/update`, `POST /time/advance`, `POST /weather/update`
- **World state:** `POST /state/transition`, `POST /map/generate` ⚡, `POST /map/move`,
  `GET /elements/presets`, `GET /elements/preset/:name`
- **Journal / notes / widgets:** `POST /journal/entry`, `GET /:chatId/journal`, `PUT /:chatId/notes`,
  `PUT /:chatId/widgets`
- **Checkpoints:** `POST /checkpoint`, `GET /:chatId/checkpoints`, `DELETE /checkpoint/:id`,
  `POST /checkpoint/load`
- **Media/visual (out-of-band):** `POST /scene-wrap` ⚡🖼, `POST /generate-assets/preview` 🖼,
  `POST /generate-assets` 🖼, `POST /spotify/candidates`, `POST /spotify/play`

Companion route files: `encounter.routes.ts` (805 lines), `scene.routes.ts` (870 lines),
`turn-games.routes.ts` (94 lines — `catalog`/`state`/`start`/`move`/`resign`).
