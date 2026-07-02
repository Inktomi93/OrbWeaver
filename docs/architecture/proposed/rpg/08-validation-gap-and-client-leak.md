# 08 — The Validation Gap & Client-Side Backend Logic (monorepo-wide)

> Two cross-cutting rot patterns that aren't RPG-specific but hit the RPG port hardest. Both are
> measured across all three packages (`ts-morph`/`grep`), not impressions. Short version: **marinara
> validates at the HTTP edge and nowhere else**, and **substantial backend logic — including
> duplicated game math — lives in the 200k-line client.**

---

## Part 1 — The validation gap

They *have* zod. They use it at route boundaries. Internally, state is `JSON.parse`d out of blob
columns and `as`-cast with no runtime validation.

| Package | zod schemas | `JSON.parse` | `as any`/`as unknown` | Read |
| --- | --- | --- | --- | --- |
| `shared` (17k LOC) | **592** | 4 | 1 | Clean. Zod-heavy, almost no raw parse/cast. This is the good package. |
| `server` (131k LOC) | 508 | **413** | **324** | Validated at the edge (508 schemas on route inputs), then 413 raw blob parses + 324 unsafe casts internally. |
| `client` (200k LOC) | **0** | 204 | 132 | **No schema validation at all.** Parses blobs raw, casts to whatever. |

**The shape of the rot:** a route input is zod-validated, then written to a `text()` JSON column, then
later `JSON.parse`d and `as SomeType`-cast with zero guarantee the stored blob still matches the type.
Every one of the 413 server parses is a place the data contract is asserted by faith. The 324 `as
any`/`as unknown` casts are where the type system was explicitly told to stop looking.

### Schemaless JSON-blob columns (the state hiding places)

`text()` columns storing unvalidated JSON, across the schema:

`chats.metadata` (the ~30-key game blob — see [`01`](01-state-model.md)), `game_state_snapshots`
sub-fields (`presentCharacters`, `playerStats`, `personaStats`, `manualOverrides`, `fieldLocks`),
plus `result_data`, `game_state`, `state`, `data`, `marker_config`, `forbid_overrides`,
`dynamic_state`, `snapshot_id`-referenced blobs. None validated at the DB boundary; each has its own
hand-rolled `parseX`/`normalizeX`/`coerceX` helper scattered near its call sites.

**Port stance:** contract schemas (zod) at **two** boundaries Orbweaver already mandates — the
persistence edge (parse-on-read, serialize-on-write) and the LLM-payload edge. That single discipline
deletes most of the 413 hand parses, the 324 casts, and — critically — most of the JSON-repair
gauntlet ([`02`](02-endpoint-flows.md)/[`07`](07-port-map.md)), because a validated tool-call result
doesn't need bracket-gluing heuristics.

---

## Part 2 — Backend logic living in the client

`packages/client/src/lib` is **12,525 lines of non-UI logic**; 76 exported logic functions across
`lib/` + `components/game/`. Much of it is legitimately client (audio, TTS, CSS, LaTeX, colors). But
several files are backend concerns that leaked — and the worst are **duplicated**, giving two sources
of truth that can drift.

### The duplications (two implementations, one truth — a drift bomb)

| Concern | Server | Client | Risk |
| --- | --- | --- | --- |
| **Dice rolling** | `dice.service.ts` `rollDice(notation)` **and** `tools/tool-executor.ts` `rollDice(args)` | `lib/slash-commands.ts` `rollDice(count,sides)` | **Three** implementations. A `/roll` in the client and a `[dice:]` from the GM can use different code paths. |
| **GM tag parsing** (`[reputation:]` `[bg:]` `[state:]` `[music:]` `[dice:]` combat/skill/inventory) | `game.routes.ts`, `segment-edits.ts`, `gm-prompts.ts`, `generation-text-utils.ts` | `lib/game-tag-parser.ts` (**1,124 LOC**) | Client re-parses the same LLM output the server parses. Grammar must stay byte-identical across packages or UI and DB disagree. |
| **Macro resolution** (`{{user}}`/`{{char}}`/…) | `services/prompt/` (`macro-context`, `marker-expander`, `assembler`) | `lib/chat-macros.ts` (`resolveMessageMacros`, `buildMessageMacroContext`) | Two macro engines; prompt preview (client) can differ from actual prompt (server). |
| **Token counting** | `shared/_kit/tokens` `estimateTokens` | `lib/character-token-count.ts` `estimateCharacterCardTokens` | Client budgets against a different estimate than the server enforces. |
| **Regex-script mutation** (ST-style output rewrite) | `services/regex/regex-application.ts` + storage + routes | `hooks/use-apply-regex.ts` + `RegexScriptEditor` | Output-mutating regex potentially applied on both sides. |

### Backend logic that shouldn't be client at all

- **`lib/game-tag-parser.ts` (1,124 LOC)** — parsing the model's structured control tags is a pure
  server concern (it drives state mutation). The client needs *rendered results*, not a 1,124-line tag
  grammar. This is the single biggest leak.
- **`lib/slash-commands.ts` (1,013 LOC)** — command execution incl. dice math and game actions. Command
  *parsing* can be client; the *effects* (dice, state changes) belong in verbs.
- **`lib/sprite-cleanup-tools.ts` (1,071 LOC)** — image manipulation client-side (overlaps the server's
  `sharp` background-removal in `sprites.routes.ts`). Heavy pixel work in the browser that mirrors
  server logic.
- **`lib/game-full-body-pose.ts`** — resolves poses from dialogue/combat state (game logic, borderline).

**Why this matters for the port:** in Orbweaver the model emits **MCP tool calls**, not text tags, so
`game-tag-parser.ts` largely *evaporates* — there's nothing to scrape. Dice/macros/token-count each get
**one** home (a `domain/rpg` verb or `@orb/kit` leaf) consumed by both sides. The client renders
server-computed results; it does not recompute them.

---

## Combined port directive

1. **One validation discipline:** zod contract schemas at the persistence + LLM-payload boundaries.
   Parse-on-read, never trust a blob. This is the biggest single quality win and it deletes whole
   categories of code (repair heuristics, hand parsers, casts).
2. **One home per computation:** dice, macros, token estimation, tag/effect resolution each live once
   (verb or kit leaf). Delete the client copies; the client calls or renders.
3. **Tags → tools:** the client's 1,124-line tag parser is a symptom of text-tag control flow. MCP
   tool calls remove the need for client-side (and most server-side) scraping.
4. **Audit the client on the way in:** when porting each RPG surface, check `client/src/lib` +
   `components/game` for a shadow implementation and collapse it, rather than porting the server copy
   and leaving the client twin behind to rot.

> Method note: counts via `grep`/`ts-morph` over `packages/*/src` (excl. node_modules). zod =
> `z.{object,string,number,array,enum,union,boolean,record}` occurrences; casts = ` as any`/` as
> unknown`. These are lower bounds (they don't count every unsafe access), but the ratio —
> shared:592/4 vs client:0/204 — is the story.
