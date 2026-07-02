# 08 — The Generative Layer & the Client Contract (server side)

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** Two halves: (§1–4) the rpg-owned IMAGERY
> orchestration — a thin policy layer over the committed `domain/imagery` (D49) — and (§5–7) the
> exact server contract the game client consumes (views, streams, verbs). The client's own design
> (surfaces, primitives, slices) is doc 11. Marinara evidence: [`../rpg/05-generative-pipeline.md`](../rpg/05-generative-pipeline.md)
> + the verified generative + client deep-dives.

**The governing deletion:** marinara's client parsed a 20+-tag grammar out of narration THREE times
(client display, client behavior, server prompt-rebuild — verified, with drift: two crit
authorities, two reputation-tier tables, three dice implementations). In this design the model
emits tools, the server owns every number, and the client receives ONLY: prose messages,
`ToolCallRecord[]` provenance, typed views, and the rpg bus. There is NO tag grammar and NO game
math in the client — the byte-level enforcer is that `@orb/client` contains no rpg computation
imports beyond `@orb/contracts/rpg` types.

---

## 1. Asset kinds (what the game generates)

| Kind | Trigger | Stored | Reaches players as |
|---|---|---|---|
| NPC portrait | `upsert_npc` creates a new NPC (imagery enabled) → `rpg-npc-portrait` workload; host "generate portrait" button | `assets` CAS → `rpg_npcs.avatarAssetId` | tracker/NPC panel avatars (view field), `gameChanged` bus |
| Scene illustration | `request_illustration` tool (cadence-gated §3) or host button → `rpg-illustration` workload | `assets` CAS | a narrator message with a `MessageMedia` block (D44) — art lands IN the story stream |
| Party/NPC sprite sheets (OPTIONAL enhancement) | host button on a character | `character_sprites` rows | the committed expressions stage (09e) |

DROPPED kinds with reasons: **reusable location backgrounds** — orbweaver has no VN
background layer (D49: app background = a theme token; scene art = in-chat media); a "background"
request is just an illustration. **Music/SFX/ambient** — media surfaces are out of scope (01 §6);
marinara's deterministic hint→asset scoring pattern is noted in the corpus for a future
`domain/media` and not built here. **Inventory/item art** — never existed (verified); not invented.

## 2. The orchestration (rpg substrate + workloads over injected `imagery.generatePicture`)

`domain/rpg/imagery/` (named subsystem — policy only, zero provider knowledge):

- **Prompt composition** (`imagery/prompts.ts`, pure): STEAL marinara's verified composition
  inputs — NPC portraits: identity line synthesized from name/description/gender/pronouns + the
  age/gender/non-human guard heuristics (port the regex heuristics; they exist to stop image models
  hallucinating species from names) + `artStylePrompt` + "solo, portrait, upper body" composition
  tags + the negative-prompt default. Illustrations: STEAL the player-POV rule (*"first-person view
  from the player protagonist's eyes; do not show the protagonist except hands or arms"*), scene
  moment + purpose + per-character appearance notes, `config.imagery.promptInstructions` appended
  last. Length caps: portrait 1400 / illustration 2200 chars (marinara's, kept).
- **Character consistency**: when `config.imagery.useAvatarReferences`, resolve up to 4 reference
  images (preference: full-body sprite → avatar asset — via injected `assets` reads) into
  `ImageEditInput`-style references on the imagery call (the D49 `edit`/reference seam); up to 5
  appearance notes for un-referenced characters (marinara's caps, kept).
- **Reuse before spend** (the pick-before-generate discipline, adapted): NPC portraits are
  content-addressed by an **identity hash** of `(name, description, gender, pronouns)` — the
  workload short-circuits when `rpg_npcs.avatarAssetId` exists AND the stored identity hash
  matches (changed identity ⇒ regenerate; marinara's slug-hash trick on CAS instead of files).
  Illustrations are never reused (moment art — marinara's timestamp rule, kept). *(The manifest
  tag-catalog layer itself is NOT ported — it existed to pick among filesystem backgrounds/music,
  both dead here; the imagery-plan enhancement "asset-manifest pick-before-generate" from the
  Feature-Slot-Map remains an `domain/imagery` idea, not an rpg one.)*
- **Preview-before-spend**: the workloads carry a `dryRun` param returning the compiled
  prompt/negative/size for host review (marinara's `/generate-assets/preview` affordance, now a
  workload param + client editor); the accepted prompt override rides the real run's params.

## 3. Illustration cadence (scarcity is the feature)

STEAL marinara's verified model — the LLM decides IF a moment is CG-worthy, code enforces RATE:
the reminder (06 §2) only lists `request_illustration` when eligible; eligibility =
`config.imagery.enabled && autoIllustrations && (sessionChanged || turnsSince(lastIllustration) ≥ 2)`;
the prompt guidance keeps marinara's bar (*"only for a major, story-defining moment… most turns
must not request one"*). `rpg_games` gains two bookkeeping columns (`lastIllustrationTurn`,
`lastIllustrationSession` — the 03 schema carries them under `config` runtime state? NO — as real
columns, updated by the workload; derive-don't-guess). Host `force` bypasses. *(Rejected: pure
every-N-turns cadence — art on a shopping turn; pure LLM discretion — every turn is "iconic".)*

## 4. Failure posture

An imagery workload failure is a workload `failed` row + an `rpg.gameChanged` poke — the story is
NEVER gated on art (marinara hard-learned this: its scene-wrap deferred generation because provider
stalls blew client timeouts, and its narration DISPLAY gated on asset readiness — the client-leak
dossier's worst UX finding). No fallback-asset picking (that was a backgrounds-layer need).

## 5. The client read contract (all in `@orb/contracts/rpg`)

tRPC read verbs (thin router → `RpgService`; every one `requireParticipant`, host variants
`requireHost`):

| Verb | Returns | Notes |
|---|---|---|
| `rpg.getGame(chatId)` | `RpgGameView \| null` | null ⇒ not a game ⇒ client mounts zero rpg UI. Member view: status/session/difficulty/config-public/worldOverview/morale tier/activeState. `RpgGmView` (host): + secrets, hidden clocks, gmNotes |
| `rpg.getHud(chatId)` | `RpgHudView` | widget defs + RESOLVED values (server resolves bindings — client never joins); visible clocks with fill; morale tier; clock/date/weather display strings (server-formatted — the client re-derived time phases in marinara, a leak) |
| `rpg.getTracker(chatId)` | `RpgTrackerView` | the resolved snapshot (scene + present + party volatiles) + lock map + which fields the CALLER may edit (own party row vs host-all) |
| `rpg.getMap(chatId)` | `RpgMapView` | member: revealed geometry only; host: full + `revealed` flags |
| `rpg.listJournal(chatId, filter?)` / `rpg.listQuests(chatId)` | paged entries / quests (member view strips `gmNotes`) | |
| `rpg.getParty(chatId)` | sheets + arcs + volatile summary | |
| `rpg.listSessions(chatId)` / `rpg.listCheckpoints(chatId)` | history surfaces | |
| `rpg.getEncounter(chatId)` | active encounter state (combatant cards, round log, legal-action hints, counterplay text) | |
| `rpg.stream(chatId)` | the rpg bus subscription (05 §5) — member stream; host stream adds hidden-clock events | resumable-shape like chat.streamMessages |

Mutation verbs the client calls directly (beyond the model's tools): `rollDice` (dice button),
`resolvePendingCheck` (the doc-12 handshake), `assignGmSeat` + the GM-console seat verbs (doc 12 §2),
`editSnapshot` (tracker edits + lock toggles), widget CRUD, journal `note` add, checkpoint
save/restore, session start/conclude/applyOutcome, scene verbs, `joinParty`, `recruitNpc`,
`confirmCharacterDeath`, game config edit, `regenerateWorldGen` — the full list with authority in
07 §3.1.

## 6. In-stream rendering (how mechanics APPEAR in chat)

- **Narration** = plain markdown prose (D44 pipeline). NO segment grammar, NO dialogue-line
  format — marinara's `[Name] [main] [expression]:` protocol was its VN renderer's input language;
  orbweaver renders prose. (Expressions/sprites integrate via the committed per-turn classify hook
  — 09e — not via narration markup.)
- **Mechanics provenance** = the variant's `ToolCallRecord[]` (D48). The client derives compact
  **game-event chips** (doc 11) from records — `skill_check` → band chip with roll breakdown;
  `tick_clock` → clock chip; `encounter_round` → round card; etc. The chips parse the RECORD
  (typed), never the prose. Server guarantees: every rpg tool result is JSON-serialized into the
  record's `result` (D48 shape) — the client's one parse is `JSON.parse(record.result)` against
  the published zod result schemas in `@orb/contracts/rpg`.
- **`offer_choices`** → choice chips (the staged choices ride the tool record; a click sends the
  choice text as the player's message).
- **Scene art** → `MessageMedia` blocks on narrator messages (D44 render, lightbox included).
- **Player dice** → the `[dice: …]` text inside user messages renders as a dice chip
  (client-side REGEX on its own emitted canonical format only — the single sanctioned text parse,
  because the text is server-generated with a fixed grammar; 05 §6).

## 7. What the client may compute (the closed list)

Rendering interpolation ONLY: timer display countdown against a server `endsAt` (if timer widgets
are used), animation/transition state, optimistic UI for its OWN verb calls (Query mutation
pattern). Everything else — dice, checks, tiers, inventory arithmetic, map reveal, widget values,
time phases — arrives computed. *(This is the corpus-08 directive made into a contract: the leak
list — client inventory authority, QTE math, enemy-stat derivation, crit trust, tier drift — has
no server surface to exist against.)*

## 8. Test plan

- Prompt-composition goldens (portrait/illustration builders: identity guards, caps, reference
  selection order).
- Identity-hash reuse: same NPC identity → workload short-circuits; changed description →
  regenerates.
- Cadence: eligibility truth table (enabled/auto/turn-gap/session-reset/force).
- View projections: binding resolution per widget source; member-vs-host map/game/tracker
  projections (canary-secret test — 06 §7).
- Contract: every rpg tool's result round-trips its published zod result schema (the chip-parse
  guarantee).
