# Marinara RPG Engine — Exhaustive Port Reference (corpus index)

> **Purpose.** Reverse-engineer the legacy Marinara RPG system in full so we can restructure it into
> an Orbweaver `domain/rpg` with our own rigor. This is a **research corpus**, not a design — it says
> what marinara *does*, mechanism by mechanism, verified against source. Design/port decisions live in
> [`07-port-map.md`](07-port-map.md) and, eventually, a promoted `domains/rpg.md`.
>
> **Source:** `references/marinara-engine` (a.k.a. neo-tavern's legacy engine — distinct from the
> current neo-tavern app). **Verification:** every count, path, constant, and symbol below was pulled
> with `ts-morph` (real symbol resolution / import graphs) and `ast-grep` (structural queries), not
> hand-review. Where a number appears, it was measured.

---

## How this corpus is organized

| Doc | What's in it |
| --- | --- |
| [`01-state-model.md`](01-state-model.md) | **Read first.** The two-layer state model: the `game_state_snapshots` **table** (per-turn, swipe-indexed, committed-flagged) vs. the `chats.metadata` **untyped blob** (~30 `meta.game*` keys). Storage repo (16 methods), field-lock / manual-override / commit semantics. |
| [`02-endpoint-flows.md`](02-endpoint-flows.md) | The 41+ `game.routes.ts` handlers + encounter/scene, grouped by concern. Each links to its reverse-engineered call-flow spine. |
| [`game.routes.flow.md`](game.routes.flow.md), [`encounter.routes.flow.md`](encounter.routes.flow.md), [`scene.routes.flow.md`](scene.routes.flow.md) | **Raw flow spines** (ts-morph-generated): every handler decomposed into its ordered call sequence, tagged `[LLM]`/`[DBWRITE]`/`[READ]`/`[PARSE]`/`[MUTATE]`/`[IMAGE]`/`[STORE]`. This is the "pulled-apart mega file." |
| [`03-services-and-mechanics.md`](03-services-and-mechanics.md) | The 26-file `services/game/` layer (109 exports): the deterministic engines (combat, weather, time, perception, loot, elements, reputation, morale, dice, skill-check, map) with verified constants, plus prompt builders and journal. |
| [`04-type-catalog.md`](04-type-catalog.md) | All 86 shared RPG types across 4 files, by file, with the load-bearing ones expanded field-by-field. |
| [`05-generative-pipeline.md`](05-generative-pipeline.md) | The **RPG-owned** imagery/asset layer (`game-asset-generation.ts`, `sprite.service`, `asset-manifest`) — NPC portraits, scene illustrations, backgrounds, sprite selection. Distinct from the generic `domain/imagery`. |
| [`06-subengines.md`](06-subengines.md) | Combat encounter sidecar, scene fork/merge, turn-games (board-game runner). |
| [`07-port-map.md`](07-port-map.md) | marinara subsystem → Orbweaver target, open questions, and what to keep / rewrite / drop. |
| [`08-validation-gap-and-client-leak.md`](08-validation-gap-and-client-leak.md) | **Monorepo-wide rot.** The validation gap (validated at the HTTP edge, untyped internally: server 413 `JSON.parse` + 324 `as any`; client 0 zod) and backend logic living in the 200k-line client — including **duplicated** game math (`rollDice` ×3, a 1,124-line client tag parser, macro/token-count twins). |

The prior single-file analysis ([`../Marinara-RPG-Architecture-Consolidated.md`](../Marinara-RPG-Architecture-Consolidated.md))
is the executive summary; this corpus is the exhaustive backing it points into.

---

## The verdict (unchanged, now fully backed)

Marinara's RPG loop is **client-orchestrated**: the UI sequences a turn by firing multiple blocking
LLM calls at different endpoints (`/generate` → `/game/scene-wrap` → `/game/party-turn`) and stitching
the results. Each endpoint independently rebuilds connection/model/prompt context and its own
structured-output parsing. **Orbweaver inverts to server-driven**: one `POST /chat`; out-of-band work
becomes async **Workloads**; structured side-effects become **MCP tool calls** inside the one turn;
RPG state is collected in **GATHER** and slotted in **BUILD** rather than concatenated ad-hoc.

## The scale (measured)

| Metric | Value |
| --- | --- |
| `game.routes.ts` | 8,659 lines / 347 KB, **41 registered endpoints** |
| — distinct symbols imported | 147, from 22 dirs/packages |
| — out-of-band LLM call-sites in that one file | 13 (`runGameChatComplete`×11, `runGameChatStream`×2) |
| `services/game/` | 26 files, 7,559 lines, **109 exported functions** |
| Shared RPG types | **86** across `game.ts` (41), `combat-encounter.ts` (23), `scene.ts` (13), `game-state.ts` (9) |
| State snapshot store | `game_state_snapshots` table + 16-method repo |
| Campaign/config state | `chats.metadata` blob, ~30 untyped `meta.game*` keys |
| Companion route files | `encounter.routes.ts` (805), `scene.routes.ts` (870), `turn-games.routes.ts` (94) |

## The single most important correction

The prior draft (and my first analysis) called RPG state "untyped JSON blobs in `chats.metadata`."
**Half wrong.** Per-turn game state is a **real table** (`game_state_snapshots`) with typed scalar
columns and swipe/commit semantics. The untyped-blob problem is real but scoped to the **campaign/
config layer** (maps, journal, HUD, party, session summaries, image settings). The port must treat
these two layers differently — see [`01-state-model.md`](01-state-model.md).

## Status of the gather

Done: state model, storage repo, all 53 route flow-spines, 26-service inventory, 86-type catalog,
generative pipeline, sub-engine surfaces. Residual deep-reads (flagged in each doc where they'd help
the port, e.g. the exact `applyGameSetupPayload` mutation, `gm-prompts.ts` section assembly) are noted
inline rather than pre-emptively exhausted — pull them per-subsystem at port time.
