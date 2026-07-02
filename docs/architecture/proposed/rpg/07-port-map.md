# 07 — Port Map: Marinara → Orbweaver `domain/rpg`

> Where each legacy piece goes, what to keep vs rewrite vs drop, and the open decisions that need a
> human call. This is a **starting position** for the port, not a locked design — promote to a real
> `domains/rpg.md` once the big decisions below are made.

---

## Keep / Rewrite / Drop

### KEEP (port faithfully — pure, tested, load-bearing)
- **All deterministic mechanics** ([`03`](03-services-and-mechanics.md)): dice, skill-check + attribute
  modifiers, passive perception + clue injection, time advance, weather progression, combat math,
  element reactions, loot tables, reputation/morale, encounter rolls, map position. → `domain/rpg/substrate/`
  as pure functions + **contract schemas + golden tests**. Highest-confidence, do this first.
- **The `game_state_snapshots` table + swipe/commit/lock semantics** ([`01`](01-state-model.md)). →
  `domain/rpg/persistence/` with typed sub-field schemas. Keep clone-forward, manual-override
  one-shot-vs-accumulate, and `fieldLocks` migration intact.
- **The server-math / LLM-narrates split.** The core principle. Never let the model do arithmetic.
- **The asset manifest "pick-before-generate" logic** ([`05`](05-generative-pipeline.md)) — cost saver.
- **The structured-output repair heuristics** (`jsonish.ts` + `textual-tool-call-parser.ts`) — but
  relocate to `infra/providers/` as a **Tier-3b local-model polyfill**, not RPG code.

### REWRITE (same intent, new mechanism)
- **The 13 out-of-band LLM calls + client orchestration** → server-driven **Workloads** + the one
  chat turn. `/scene-wrap` and `/party-turn` stop being client-sequenced endpoints.
- **Structured side-effects** (HUD updates, party moves, music, illustration triggers) → **MCP tool
  calls** inside the turn, not bespoke JSON-returning endpoints.
- **`gm-prompts.ts` ad-hoc concatenation** → the chat pipeline's **GATHER** (RPG state as a gather
  source) + **BUILD** (deterministic slotting). RPG contributes context; it doesn't build the prompt.
- **The `chats.metadata` untyped blob** ([`01`](01-state-model.md) Layer B, ~30 keys) → decomposed
  typed sub-contracts: `Campaign`, `Journal`, `MapSet`, `HudState`, `PartyRoster`, `ImageConfig`,
  `SessionLog`. Each with its own persistence, mutated by verbs, not by route handlers.
- **`game-asset-generation.ts`** → a sealed `domain/rpg` imagery-orchestration subsystem consuming an
  injected `imagery.generateImage` op ([`05`](05-generative-pipeline.md)).
- **The ~10 `apply-json` repair-twin endpoints** → deleted; native tool-use + Tier-1 JSON mode makes
  the human-repair modal unnecessary for the common path.

### DROP (or defer indefinitely)
- **Turn-games** ([`06`](06-subengines.md)) — Uno-only framework; graft later only on product demand.
- **Discord mirroring** (`mirrorGameMessageToDiscord`, threaded through most endpoints) — legacy side
  channel; drop unless explicitly wanted.
- **The God-route structure itself** — `game.routes.ts` becomes a thin tRPC shim over `domain/rpg` verbs.

---

## Subsystem → target table

| Marinara | LOC | Orbweaver target | Notes |
| --- | --- | --- | --- |
| `game.routes.ts` (41 endpoints) | 8659 | `domain/rpg/verbs/` + thin transport | one verb per real operation; drop repair twins |
| `services/game/*` deterministic | ~2500 | `domain/rpg/substrate/` | pure, port 1:1 + schemas + golden tests |
| `gm-prompts.ts`, `party-prompts.ts`, `segment-edits.ts` | ~1900 | chat GATHER/BUILD sources | not ported as-is |
| `game_state_snapshots` + storage | — | `domain/rpg/persistence/` | typed sub-fields; keep semantics |
| `chats.metadata.game*` (~30 keys) | — | typed sub-contracts in `contract/` | the decomposition worklist |
| `game-asset-generation.ts` | 1012 | `domain/rpg/` imagery subsystem | injected `generateImage` op |
| `jsonish.ts` + `textual-tool-call-parser.ts` | ~500 | `infra/providers/` polyfill | Tier-3b only |
| `combat-encounter.ts` + `encounter.routes.ts` | — | `domain/rpg` encounter subsystem | sealed, verb-entered |
| `scene.ts` + `scene.routes.ts` | — | **likely `domain/chat`** (fork/merge) | see open Q3 |
| turn-games | — | defer | Uno-only |
| 86 shared types | — | `@orb/contracts` (cross-boundary) + `domain/rpg/contract/` (internal) | add Zod |

---

## Open decisions (need a human call before design)

1. **State layer split ownership.** Layer A (snapshots) is clearly `domain/rpg`. Layer B (campaign/
   journal/maps/HUD) — one `rpg` domain with sub-contracts, or several small domains
   (`domain/journal`, `domain/campaign`)? Lean: **one `domain/rpg`** with internal sub-contracts
   (KISS — these only exist together, for a game), but confirm the size doesn't warrant a split.

2. **How structured side-effects reach state.** MCP tools inside the turn is the direction (D47/D48),
   but which effects are tools vs GATHER-derived? E.g. weather/time advance are deterministic and could
   be pure GATHER-phase computation; HUD/party/illustration are model-driven tool calls. Draw the line.

3. **Scene fork/merge home — `rpg` or `chat`?** Forking a chat and merging a summary back is a general
   roleplay capability, not RPG-specific ([`06-subengines.md`](06-subengines.md) B). Strong lean: **`domain/chat`**
   owns fork/merge, `rpg` consumes it. Decide with the chat scaffold.

4. **Two combat systems — unify or keep separate?** Overworld (`combat.service`) vs encounter sidecar
   (`combat-encounter`) are separate today with overlapping concepts. Keep separate (less risk) or
   unify the math? Lean: **keep separate initially**, revisit if duplication bites.

5. **Sprite prompt-composition seam** with `domains/expressions.md` — expression-sheet generation is
   expressions-owned, but composing prompts from character/game appearance is shared. Draw the boundary.

6. **Local-model polyfill scope.** How much of the `jsonish`/textual-parser repair gauntlet do we
   actually need, given Orbweaver targets Tier-1 models by default? Port the minimum for the local/
   Tier-3b path; don't drag in the full "prompt-and-pray" apparatus if the local path is niche.

---

## Suggested port order (de-risked)

1. **Deterministic substrate** (dice → skill-check → time → weather → loot → combat math → reputation).
   Pure, testable, no dependencies. Proves the `domain/rpg/substrate` shape.
2. **State layer** (snapshots table + repo + contract schemas). The spine everything else writes to.
3. **Campaign metadata decomposition** (Layer B → typed sub-contracts). The biggest rigor win.
4. **The turn integration** (GATHER RPG state → BUILD; side-effects as MCP tools). Where it plugs into chat.
5. **Generative subsystem** (asset gen orchestration on injected imagery op).
6. **Sub-engines** (encounter sidecar; scene fork if not chat-owned).
7. **Defer** turn-games until demanded.

Each step is independently shippable and testable — no big-bang port of the 8,659-line monolith.
