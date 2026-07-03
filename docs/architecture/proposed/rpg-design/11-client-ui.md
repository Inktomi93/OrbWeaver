---
kind: spec
status: active
updated: 2026-07-03
---

# 11 — Client & UI Design (the game surface)

> **Status: COMMITTED (D58, 2026-07-01) — prescriptive design; the ledger D-entry wins on any conflict.** The complete client design for RPG mode: where the game
> UI lives in the shell, what renders each server-computed fact, and how freshness flows. Built
> against orbweaver client law (`core/UI-Architecture-and-Layout.md` D42/D43/D44/D54 — feature-slice,
> container-driven layout, `@orb/ui` seals, the gate battery) and the server design (docs 01/03/04/05
> in this directory — vocabulary here matches those docs EXACTLY: tool names like `skill_check`,
> events like `snapshotPatched`, views like `RpgHudView`). Marinara's client is mined for WHAT a
> playable game needs (surfaces, affordances); almost none of its HOW survives — its client
> re-implements server logic (dice, tag parsing, combat math), the exact anti-pattern this design
> exists to kill.

**The one governing rule (pillar P1, client half):** the client RENDERS server-computed results and
computes NOTHING. No dice math, no check bands, no lock-path grammar, no fog-of-war math, no combat
arithmetic, no tag parsing. Every number on screen is a field of an `@orb/contracts/rpg` view type
(`RpgGameView` · `RpgHudView` · `RpgTrackerView` · `RpgMapView`) or of a persisted `ToolCallRecord`
result (D48). Marinara's 1,124-line client tag grammar, its client `rollDice`, and its client game
math are DEAD (01 §5 DROP) — nothing in this doc re-grows them.

---

## 1. Feature-slice home — `features/rpg/`, and how it composes with chat

**DECISION:** CREATE `packages/client/src/features/rpg/` as a standard flat feature slice:

```
packages/client/src/features/rpg/
  surfaces/         hud-strip.tsx · game-panel.tsx (tabbed CONTEXT section) · encounter-panel.tsx ·
                    setup-wizard.tsx · gm-drawer.tsx · character-sheet-drawer.tsx
  anchors/          hud-anchor.tsx (containment provider for the thread flanks)
  components/       widgets/ (the 8 kind renderers) · chips/ (game-event chips) · map/ ·
                    tracker/ (field rows + lock toggle) · encounter/ · dice-popover.tsx ·
                    address-toggle.tsx · initiative-strip.tsx
  hooks/            use-rpg-game.ts (the gate) · use-rpg-stream.ts (SSE→invalidate) ·
                    use-rpg-mutations.ts (createEntityMutation wrappers per verb)
  lib/              game-event-registry.ts · dice-text.ts (the ONE display regex, §4)
  index.ts
```

**How rpg mounts into a chat without chat knowing rpg exists.** The server keeps chat rpg-blind via
three injected ops (05 §0); the client mirrors that discipline with **registry slots wired at the
composition root** (`main.tsx` — the sanctioned cross-feature injection point, UI-Arch §11.0). The
chat feature EXPOSES three registries; `features/rpg` never imports `features/chat` and vice versa
(gate `client-features-no-cross`):

| Registry (owned by chat, populated at `main.tsx`)                                                                             | rpg contribution                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `CHAT_SURFACE_SLOTS` — region-keyed: `thread-flank-left` · `thread-flank-right` · `above-composer` · `composer-leading` · `header-actions` · `thread-actions-menu` | HUD strips (flanks) · initiative strip (above-composer) · dice button + address toggle (composer-leading) · GM button (header-actions) · "Start a campaign…" (thread-actions) |
| `CHAT_CONTEXT_SLOTS` — sections of the CONTEXT panel for the active chat                                                        | the game panel (tabbed: Tracker · Party · Map · Journal · Quests; encounter takeover)                 |
| `TOOL_RENDERERS` — `toolName → renderer`, default = the D48 generic tool-invocation `<details>` block                          | ~24 game-event chip renderers (§4)                                                                    |

Registries are registry-as-data with the `check:registry-pairing` discipline (a slot id without a
component is a `tsc`/check error). **WHY registries over imports:** it is the client twin of the
server's injected-ops precedent — the graft point is data wired at the root, so a non-rpg build (or
test) simply doesn't register the entries and chat is byte-identical. *Rejected: rpg wrapping/
re-exporting the chat surface (inverts ownership, breaks on every chat change); chat importing rpg
renderers directly (banned coupling, and re-creates marinara's game-aware chat client).*

**Non-game chats mount ZERO rpg UI.** Every rpg slot component gates on
`useGatedQuery(trpc.rpg.getGame, chatId)` — the server returns `null` for a chat with no `rpg_games`
row (the `chats.metadata.rpg` pointer is the server's cheap check; the client uses the query, one
home). `null` ⇒ the component renders nothing, `use-rpg-stream` never subscribes, no rpg query keys
exist in the cache. The ONLY rpg-visible affordance on a non-game chat is the host-only
"Start a campaign…" thread-actions item (→ the wizard, §10). *Rejected: a client-side read of chat
metadata for the gate — it forks the truth source; `rpg.getGame` is the same canon the panels need
anyway, so the gate query is free.*

**How the 4-tier container layout accommodates the game.** The game adds no shell region and no
`@media`. HUD strips are ANCHORS inside the CONTENT region (the thread's left/right flanks — §2);
the deep panels are a CONTEXT section; drawers are `@orb/ui/drawer`. Every rpg surface is a
containment consumer (`@container` only); in a narrow container the HUD flanks collapse to a single
horizontal strip between the header and the thread — a container query, not a prop (gates
`no-media-queries-in-features`, `no-layout-context-props`).

**DECISION — the HUD lives IN the CONTENT region (thread flanks), not the CONTEXT panel.** Visible
stakes (pillar P3) must survive "immersive-ST" mode, where both side panels are collapsed; a HUD
homed in CONTEXT vanishes exactly when the player is most immersed. The shell's "leftover width
feeds CONTEXT, not a wider chat" rule is unviolated: the flanks consume CONTENT-internal leftover
around the 65–75ch prose cap, which is dead space in a game chat. *Rejected: HUD as a CONTEXT tab
(vanishes in immersive mode); a fifth shell region (a shell change for one feature — the D42/D43
shell's four regions stay).*

## 2. The HUD — the 8 widget kinds → `@orb/ui` primitives

Server truth first (03 §8): widget DEFINITIONS are `rpg_hud_widgets` rows; widget VALUES derive from
**bindings** (`party-hp` · `pool` · `clock` · `reputation` · `morale` · `time` · `weather` ·
`custom`). `RpgHudView` delivers each widget **ready to render** — `{type, label, icon, position,
accent, sort, value, max?, tier?, milestones?, dangerBelow?, items?}` — the derivation (HP from the
resolved snapshot, clock fill from the `rpg_clocks` row, tier from reputation) happened server-side.
The client maps `type` to a renderer and never computes a value.

| Widget `type`        | Backing `@orb/ui` primitive                                                | Notes                                                                                      |
| -------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `progress_bar`       | `@orb/ui/meter` `<Meter kind="linear">`                                     | value/max + optional `dangerBelow` accent (HP turning red is a token swap, not a color calc) |
| `gauge`              | `<Meter kind="arc">`                                                        | same data, radial presentation                                                             |
| `relationship_meter` | `<Meter kind="bipolar">`                                                    | −100..100, center origin, tier milestone ticks + a current-tier label (reputation, 04 §6)  |
| `counter`            | feature composition (`layout` Row + `icons` + text)                         | no primitive needed — a number with an icon                                                |
| `stat_block`         | feature composition (layout grid of label/value pairs)                      |                                                                                            |
| `list`               | plain list (feature)                                                        | HUD lists are short by design (blueprint cap); long lists live in the panel tabs           |
| `inventory_grid`     | feature composition (token-sized cell grid)                                 | full inventories live in the sheet drawer (§6), virtualized there                          |
| `timer`              | feature composition over `lib/time.ts`                                      | renders IN-WORLD time/countdown from server values ONLY — no `Date.now()`, no client tick (marinara's timer counted down in the browser and wrote state back — the anti-pattern) |
| *(clock rows)*       | `<SegmentedClock segments filled>` — NEW                                    | progress clocks (03 §5) render on the HUD whenever a `clock`-bound widget or visible clock exists |

**DECISION — NEW `@orb/ui` primitives (domain-agnostic; `features/rpg` composes them):**

- **`@orb/ui/meter` grows `kind: "linear" | "arc" | "bipolar"`** (tailwind-variants unions) plus two
  optional affordances: milestone ticks (`milestones?: number[]`) and a danger threshold
  (`dangerBelow?: number` → swaps to the danger intent token). D52 gave `meter` the 1-D-magnitude
  mandate; a gauge and a bipolar meter are 1-D magnitudes with different dress.
- **`<SegmentedClock>` — a segmented circle showing `filled/segments`** — exported from the
  `@orb/ui/meter` group (one home for 1-D magnitude display). Props: `segments (4|6|8|12 fits, but
  the primitive takes any int ≥2 — it is domain-agnostic)`, `filled`, `size`, intent accent, a
  `completed` visual state. It knows nothing of fronts or consequences.

**DECISION — NO game widget uses ECharts.** D52 scopes the ECharts seal to corpus analytics; every
game display is a magnitude, a count, or text — not a chart. ECharts' Canvas token-resolution cost
and bundle weight for a 40px circle is absurd. *Rejected: ECharts `gauge`/`pie` for gauges and
clocks — wrong tool class; also rejected: a standalone `@orb/ui/segmented-clock` package dir —
it splits the 1-D magnitude home that D52 just consolidated.*

**Layout.** Two vertical strips honor `rpg_hud_widgets.position` (`hud_left` | `hud_right`),
`sort`-ordered, each independently collapsible (a chevron; state in the panel store, §9). The strip
is an anchor (containment provider); each widget is a card/row that adapts to strip width via
`@container`. The server caps model-authored widgets at ≤4 (03 §8); the host adds more via the GM
drawer's widget editor (§6).

## 3. Data flow — Query over tRPC reads, `rpg.stream(chatId)` drives freshness

**Reads.** All server state enters through TanStack Query over the tRPC proxy (keys 100%
proxy-derived — gate `no-array-literal-querykey`; types from `@orb/contracts/rpg`, type-only —
`client ⇏ @orb/server` physics). The client-consumed read surface (procedure names are pinned by the
transport chunk; the VIEW types from 03 §12 are the contract):

| Query                                  | Returns                                                            | Consumers                          |
| --------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `trpc.rpg.getGame({chatId})`            | `RpgGameView` (member) / `RpgGmView` (host) — server projects by caller role; `null` = not a game | the gate (§1), session/status chrome |
| `trpc.rpg.getHud({chatId})`             | `RpgHudView` — widgets with derived values + visible clocks         | HUD strips                          |
| `trpc.rpg.getTracker({chatId})`         | `RpgTrackerView` — resolved snapshot: scene fields, present characters, party volatile, field locks, provisional quest view | Tracker tab, Party tab             |
| `trpc.rpg.getMap({chatId})`             | `RpgMapView` — member projection = revealed geometry ONLY           | Map tab                             |
| `trpc.rpg.getEncounter({chatId})`       | active `rpg_encounters` state + rounds/log, or `null`               | Encounter surface, initiative strip |
| `trpc.rpg.listJournal({chatId})` (infinite) | `rpg_journal` pages                                             | Journal tab (`maxPages` + virtual-list) |
| `trpc.rpg.listQuests({chatId})`         | `rpg_quests` (member view — `gmNotes` stripped server-side)         | Quests tab                          |
| `trpc.rpg.listNpcs({chatId})`           | `rpg_npcs` (name, emoji, portrait, reputation tier, location)       | Cast tab                            |
| `trpc.rpg.listCheckpoints({chatId})`    | `rpg_checkpoints` + derived display context                         | GM drawer (host-only)               |

`QueryClient` defaults apply unchanged (D54): `staleTime: Infinity` — the bus drives freshness —
plus `refetchOnReconnect: true` as the SSE-gap catch-up. Reads sit in `<QueryBoundary>`;
conditional reads use `useGatedQuery`/`skipToken`.

**The subscription.** `use-rpg-stream.ts` mounts ONE `trpc.rpg.stream({chatId})` subscription per
open game chat (member-gated; the server projects hidden-clock events off the member stream — 05 §5;
the host's stream includes them, same procedure). Its `onData` does exactly two things — buffer
nothing durable, write no store — it calls `invalidate(event)` through the central
`data/invalidation.ts` seam (gates `bus-onData-no-store-write`, `no-inline-invalidate-outside-seam`).
Events are id-only (the D38 discipline): **invalidate + refetch, never payload-written into the
cache.** *Rejected: `setQueryData` from event payloads — the events deliberately carry no state, and
hand-maintained cache writes are the documented anti-pattern the invalidate-and-refetch model
replaces.*

**The event → query-key invalidation map** (the `RpgBusEvent` union, 05 §5 — this table IS the
`invalidation.ts` entries; exhaustive over the union, `exhaustive-dispatch`):

| `RpgBusEvent.type`                                  | Invalidates (`trpc.rpg.*.queryFilter({chatId})`)               | Plus                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `snapshotPatched`                                    | `getHud`, `getTracker`                                           | —                                                |
| `clockChanged`                                       | `getHud`                                                         | —                                                |
| `clockCompleted`                                     | `getHud`                                                         | toast ("⏰ *name* completes")                    |
| `checkResolved`                                      | NONE — no canon changed that `snapshotPatched` doesn't cover     | the dice toast (band + skill, transient)         |
| `reputationMilestone`                                | `getHud`, `listNpcs`                                             | toast (tier crossing, direction arrow)           |
| `mapChanged`                                         | `getMap`                                                         | —                                                |
| `encounterStarted` / `encounterRound`                | `getEncounter`                                                   | panel auto-focus (§6)                            |
| `encounterEnded`                                     | `getEncounter`, `getHud`                                         | summary card render                              |
| `questChanged`                                       | `listQuests`, `getTracker`                                       | —                                                |
| `sessionChanged`                                     | `getGame`                                                        | session banner (concluding → host confirm, §6)   |
| `gameChanged`                                        | the broad `trpc.rpg` filter (config/state/widget-defs catch-all) | —                                                |

Toasts render via `@orb/ui/toast`, fired from the same seam handler (a toast is transient chrome,
not state). Message-stream chips (§4) do NOT ride this bus — they render from persisted
`ToolCallRecord`s arriving with the message via the normal chat stream/read path.

## 4. Message-stream rendering — game-event chips from `ToolCallRecord`s

Server truth: every tool call a turn makes persists as `ToolCallRecord[]` on
`message_variants.toolCalls` (D48), each carrying the structured args + the structured RESULT
(`{band, rolls, usedRoll, modifier, total, dc, consequence}` for `skill_check`, the round envelope
for `encounter_round`, etc.). The model narrates outcomes in prose in the same variant.

**DECISION:** dice results, check outcomes, combat rounds, clock ticks render as **compact game-event
chips under the message body**, derived by parsing the RECORD (through the `@orb/contracts/rpg`
tool-result schemas), NEVER the prose. The chips register into chat's `TOOL_RENDERERS` seam (§1);
any tool without an rpg renderer falls back to the D48 generic tool-invocation `<details>` block.
*Rejected: parsing narration text for game markers (that is marinara's tag parser — dead by design);
diffing tracker state across messages to infer events (fragile, and the record already IS the
event).* 

**The registry:** `lib/game-event-registry.ts` —
`GAME_EVENT_RENDERERS: Record<RpgToolName, ChipRenderer>` as a mapped-type Record over the tool
tuple (05 §3): a new tool without a renderer is a `tsc` error, not a silent default
(`exhaustive-dispatch`).

**Chip classes** (prominent card vs folded line):

- **Prominent chips** — one visual block each, under the prose:
  - `skill_check` — the check chip: `d20 11 +3 = 14 vs DC 15` + the band as a token-accented pill
    (`critical_success`→accent · `success`→success · `partial`→warning · `failure`/`fumble`→danger —
    intent tokens, never raw color) + the consequence one-liner ("Guard Patrol ticks 2/6", "−1
    Stamina") straight from `result.consequence`.
  - `roll_dice` — dice chip: notation, per-die faces, total.
  - `tick_clock` / `create_clock` — a mini `<SegmentedClock>` with before→after fill; `completed:
    true` renders the completion state.
  - `resolve_combat_round` / `encounter_round` — a collapsible round card: per-combatant hit/miss,
    damage, conditions applied, from the round result JSON.
  - `start_encounter` / `attempt_flee` / `conclude_encounter` — encounter frame / flee outcome /
    the `RpgCombatSummary` card.
  - `grant_loot` — rarity-accented item list.
  - `update_reputation` — NPC name + action + tier arrow (milestone highlighted).
  - `advance_time` — clock delta + weather change if present + encounter-triggered flag.
  - `move_party` — destination + "N locations revealed".
- **Folded** — bookkeeping tools (`update_scene`, `update_party`, `update_inventory`, `upsert_npc`,
  `upsert_quest`, `add_journal_entry`, `add_map_node`, `set_widget_value`, `transition_state`,
  `request_illustration`, `end_session`) collapse into ONE "`N` state changes" `<details>` line per
  message; each row inside is icon + a one-line description. WHY: the prose already narrates these;
  the fold is provenance, not spectacle.

**User dice text.** `[dice: 2d6 = 9 (4,5)]` rides the user message as plain text, server-minted
(05 §6). `lib/dice-text.ts` upgrades it at display time to the same dice chip via ONE anchored regex
over the canonical server format, registered as a message-text decorator alongside the tool
renderers. This is display sugar over a server-emitted string, not a grammar — the client never
generates or interprets it semantically (the server re-parses its own text authoritatively).
*Rejected: leaving it as plain text — acceptable fallback, but visual parity with assistant-side
dice chips is one regex.*

## 5. Map + scene art + portraits

**The map is a tab of the game panel** (CONTEXT section, §6), rendered as feature-owned inline SVG in
`components/map/` — grid maps (2..12 × 2..12 emoji/label cells + party marker) and node maps (nodes
at % coords + edges + a party ring), per the `RpgMapData` discriminated union (03 §7).
*Rejected: an ECharts `graph` render (analytics seal, wrong aesthetic); a map `@orb/ui` primitive
(one consumer — the 3+-repeats litmus fails).* 

**Fog of war is server-enforced projection, not a client effect.** The member `RpgMapView` contains
ONLY revealed cells/nodes (+ edges between revealed nodes) — the client renders everything it
receives and paints the void as unexplored texture; **absence IS the fog**. The host view receives
full geometry with `revealed` flags and dims unrevealed features. A contract test asserts an
unrevealed node id from the host fixture never appears in the member render (§13). *Rejected:
shipping full geometry + a client mask (P3 says hidden information never reaches the member wire).*

**The map is read-only in v1.** Movement is narrative — the model calls `move_party`; the map is a
live diagram, not a board (03 §7). `mapChanged` invalidates `getMap`. *Rejected for v1, DOORED for
v1.1: marinara's click-to-move. Its mechanism is actually loop-respecting — tapping a revealed node
staged a destination chip and committed intent TEXT ("*moves to the Old Mill*") with the next send,
no movement verb — the same insert pattern as dice (§7). It is deferred, not wrong: it costs a
staged-chip UI for an intent one can just type. Hard-rejected either way: a client movement VERB
(bypasses the turn loop; the model must be free to interpret travel).*

**Scene art needs zero rpg client code.** `request_illustration` → the `rpg-illustration` workload →
an async chat message carrying a `MessageMedia` block (D44) — the standard media render path.
**NPC portraits** resolve at render time: `presentCharacters[].characterId` → the character avatar,
or `npcId` → `rpg_npcs.avatarAssetId` → the `asset://` blob URL, else the emoji fallback (03 §2.1);
rendered through the standard asset/avatar path, sized by container.

## 6. Panels — tracker · party/sheet · journal · quests · encounter · checkpoints/session

**DECISION:** ONE game panel as a CONTEXT-panel section with tabs — **Tracker · Party · Map ·
Cast · Journal · Quests** — plus an encounter takeover state. Deep-dive surfaces (full character
sheet, GM tools) are drawers on top. WHY: the CONTEXT panel is the shell's designed detail home and
gets the dock⇄overlay⇄collapse behavior (the D43 clamp-overlay shell) for free on every viewport. *Rejected:
a drawer per surface (stacking hell, six entry points to remember); a full-screen game dashboard
route (the game happens IN the chat — a separate route re-creates marinara's mode split); marinara's
draggable/lockable floating panels (the D44 appearance spec explicitly cut `movingUI` free-form
dragging — the shell's fixed regions + container queries are the layout system).*

- **Tracker (default tab)** — `RpgTrackerView`: location · in-world clock + `calendarDate` · weather
  · `activeState` badge · present characters (portrait, name, emoji, mood, outfit, thoughts,
  customFields) · `recentEvents` · per-member volatile rows (HP `<Meter>`, pools, conditions,
  status). Edit + lock affordances per §7.
- **Party tab** — one row per `rpg_party` member (name, class, HP, pools, conditions, arc hook).
  Row click → the **character-sheet drawer** (`@orb/ui/drawer`): the full `RpgSheet` (attributes,
  skills, abilities, strengths/weaknesses, speed/attack/defense), the personal `arc`, and inventory.
  Mechanical sheet fields are READ-ONLY — sheets evolve only via `rpg.applySessionOutcome`
  (host-accepted at session wrap, 03 §4.1); member-owned freeform (status line, notes) is editable.
  Long inventories virtualize via `@orb/ui/virtual-list` (gate `virtualizer-only-in-seal`).
- **Cast tab** — the living NPC roster from `listNpcs`: portrait (`avatarAssetId` → asset URL, emoji
  fallback), name, reputation TIER label (the 7 tiers, 04 §6 — the client shows the server-given
  tier, it never derives one from the int), current location. Read-only; NPCs are model-authored via
  `upsert_npc`. (Marinara buried this in a Journal NPCs tab; the cast deserves its own tab — it is
  the social map of the game.)
- **Journal tab** — type-filter chips (the 7-member journal type enum) over an infinite
  `listJournal` query (`maxPages`) rendered in `@orb/ui/virtual-list` — journals grow unbounded.
  Plus a **player note composer**: members write `note`-type entries through the same
  `addJournalEntry` verb the tool consumes (member-gated to `type: "note"`) — table notes visible to
  GM and party, the one member-writable journal type. *Rejected: a separate notes store — one
  journal, one table.*
- **Quests tab** — active/completed/failed groups; objective checklists render read-only (the model
  flips them via `upsert_quest`; the tracker's provisional view shows pre-commit state). `gmNotes`
  never reaches this surface — stripped server-side (03 §6), not hidden client-side.
- **Encounter takeover** — when `getEncounter` is non-null, the game panel auto-switches to the
  **encounter surface** (opt-out in the panel store) AND a compact **initiative strip** mounts in
  the `above-composer` region so combat state survives collapsed panels. Contents, all verbatim from
  `rpg_encounters.state`: round number · initiative order AS SERVER-ORDERED (no client sort) ·
  per-combatant HP `<Meter>` + conditions + cooldowns · boss mechanics/counterplay text as the
  server projects it · the round log · declared actions. **NO client combat math** — every number
  renders as delivered; the in-stream `encounter_round` chip (§4) is the same data's narrative twin.
  `encounterEnded` → the `RpgCombatSummary` card + the panel reverts. *Rejected: marinara's
  full-screen JRPG battle UI with an Attack/Skills/Defend/Items/Flee action menu + target picking —
  that is a SECOND input pipeline (pillar P2: one turn, one path; players declare actions in chat
  and the model calls `encounter_round` with typed actions); also rejected: a combat modal covering
  the thread — combat is narrated IN the thread, and a modal hides the narration it accompanies.*
- **Checkpoints + session — the host-only GM drawer** (`header-actions` "GM" button, host-gated;
  member clients don't render the button): checkpoint list (label, trigger, derived
  location/time context) + create + restore-with-confirm (the dialog quotes 03 §10 loudly: *a
  checkpoint is a scene bookmark — campaign tables are NOT rolled back*); session controls
  (`rpg.startSession` / `rpg.concludeSession` confirm); the clock-create form (name, segments,
  kind, visibility, consequence — the same `createClock` verb the `create_clock` tool consumes,
  host-gated); the widget add/edit form (label, type, position, binding); the concluded-session
  recap list (`rpg_sessions` summaries + resume points, read-only — sheet/summary changes flow
  through the `rpg.applySessionOutcome` accept flow at wrap, not free edits); and
  `rpg.confirmCharacterDeath` on a party row when `houseRules.deathRule` permits and a defeat is
  pending (04 §3 — a host verb, never a model tool). When the model calls `end_session` and the
  session flips `concluding` (`sessionChanged`), a banner in CONTENT offers the host
  Conclude / Keep playing; the session-wrap workload's proposed outcomes (sheet bumps, downtime,
  clock regression — 01 §5 ADD) render in the same banner as an accept/decline list. Hidden clocks
  and their consequences appear ONLY in the host's HUD/drawer (the host stream + `RpgGmView` carry
  them; member views never do — P3).

## 7. Input affordances — dice, address mode, tracker edit, GM verbs

- **The dice button** (`composer-leading` slot): a popover (quick picks d20/d6/2d6/… + free `NdM±K`
  notation) → calls the member-gated **`rpg.rollDice` verb** (server RNG, 04 §1) → inserts the
  returned canonical text `[dice: 2d6 = 9 (4,5)]` into the composer draft (05 §6). Rolling again
  appends — **the "queue" IS the draft text**; marinara's separate dice-queue state dies. GATHER
  detects the tag server-side; the client's only job is the insert. *Rejected: client-side rolling
  (pillar P1 — no die is ever client-rolled); marinara's queue-then-resolve-at-send (a pending-dice
  chip resolved inside the send verb — couples the roll to send plumbing and hides the number until
  after commit; roll-at-click is simpler and the server law, 05 §6); a dice Zustand queue (duplicate
  state for what the draft already holds).*
- **`/roll <notation>`** in the composer slash menu = the same verb-then-insert path. **DECISION:
  all v1 game inputs are plain verb calls** (via `createEntityMutation`); nothing depends on D46
  automation. *Rejected: `/roll` as a D46 Tier-1 action — automation is Phase 8; a day-one
  affordance can't wait on it, and an insert needs no rule engine.*
- **The address-mode toggle** (`composer-leading`): a segmented Scene · Party · GM control. Party/GM
  prefix the literal `[To the party]` / `[To the GM]` onto the outgoing text at send (05 §7 — the
  reminder variant does the rest server-side); Scene sends unprefixed. Sticky per chat (input store,
  §9). No schema, no verb.
- **Player tracker edit with auto-lock** (03 §2.3): editable tracker fields/rows show a pencil →
  inline edit → **`rpg.editSnapshot`** (member-gated for your own party row, host-gated for scene +
  others). The edit AUTO-LOCKS the field, with a per-edit "keep unlocked" opt-out checkbox in the
  edit affordance. Every lockable row/leaf shows a lock toggle reflecting presence in
  `RpgTrackerView.fieldLocks`; unlocking deletes the key. **The client treats lock keys as opaque
  strings delivered by the view** — the stable-id dot-paths are minted server-side; no lock-path
  grammar exists client-side (the 03 §2.3 design deleted the mini-language; the client must not
  re-grow it). *Rejected: a separate "manual override" edit mode — 03 §2.3 already collapsed
  overrides into edit-auto-locks; one mechanism, one UI.*
- **Host GM verbs** (§6 drawer) — `rpg.concludeSession`, checkpoint create/restore, `createClock`,
  widget CRUD, `rpg.confirmCharacterDeath` — all plain `createEntityMutation` calls with per-mutation
  error slots (never multiplexed).

## 8. Theming — can a campaign restyle the room?

**DECISION: not in v1; the deferred D44 per-chat `ThemeScope` axis is the designated carrier.** D44
§12.1 deliberately deferred per-chat theme scope while building the resolution order
(`character > global > default`) to accept it without rework. When that axis lands, a campaign
visual theme = a Zod-clamped **token-override subset** (`ThemeOverride`: accent, bubbles,
dialogue/narration colors, font-allowlist, radius, background) stored as the chat's theme override
and applied via `<ThemeScope>` on the chat subtree — at which point the setup wizard can offer
curated genre seeds ("Horror" = deep-red accent + dark background). **NEVER raw CSS into the app
document** — the token-override API is the entire per-chat theming surface (gate
`theme-override-only-via-scope`). `rpg_games.artStylePrompt` styles generated ART only; it never
touches CSS. *Rejected: an rpg-private theming mechanism now — a second theming system racing the
one D44 built; the game gains nothing a chat-scoped override won't give it later for free.*

## 9. State ownership — the exact Zustand slices

**ALL game numbers are server state in TanStack Query.** A game value in a Zustand store is a
review-reject. Client Zustand holds UI state only — exactly TWO stores (flat in `state/`, gates
`state:files` + `persist-partialize-and-total-migrate`):

1. **`rpg-panel-store.ts`** — `{ activeTab: Record<ChatId, RpgPanelTab>; hudLeftCollapsed: boolean;
   hudRightCollapsed: boolean; encounterAutoFocus: boolean }` + actions. Persisted device-local
   (`persist` with `partialize` to those keys + `version` + a total `migrate`).
2. **`rpg-input-store.ts`** — `{ addressMode: Record<ChatId, "scene" | "party" | "gm"> }` + actions.
   NOT persisted (session-transient; a stale "GM" mode resurrecting days later is worse than
   re-picking it).

Everything else: the dice popover is local `useState`; the setup wizard's draft lives in its form
factory's Zustand-persist draft mirror (§10) and its step index is local `useState`. *Rejected: a
"game store" caching HUD/tracker values (the second-store anti-pattern `bus-onData-no-store-write`
exists to kill); a dice-queue store (§7 — the composer draft is the queue).*

## 10. The setup wizard (session zero)

CREATE `surfaces/setup-wizard.tsx`, opened from the host-only "Start a campaign…" thread action on a
non-game chat, as an `@orb/ui/dialog` surface. **Four steps — marinara's proven shape** (GAME_MODE
wizard order), producing ONE `RpgGameConfig` (03 §1.1):

1. **Genre & Setting** — `genres` (1–4), `setting`, `tones` (1–3), `rating`, `language`.
2. **Party & GM** — `gm` (standalone persona | pick a roster character), `difficulty`, the
   `houseRules` dials (`failForward`, `criticalRange`, `deathRule`; `elementPreset` hidden in v1 —
   elements are the last build chunk), `imagery` + `lorebook` toggles.
3. **You** — the player's seat: confirm name/persona, optional class/concept preference (feeds the
   server-side sheet seeding, 03 §4.1 — the client proposes text, the server instances the sheet).
4. **Goals** — `playerGoals`, `additionalPreferences`.

The wizard does NOT re-ask party membership, connections, or generation presets — the ROSTER is the
party and the chat's connection/preset own model choice (03 §1.1 WHY). This is why marinara's SEVEN
steps (Connection → World → Party → Goals → Lorebooks → Features → GM) collapse to four: Connection,
Party, and Features (image/sidecar/Spotify pickers) are homed in orbweaver's connection/roster/
config domains or dropped outright; Lorebooks ride the step-2 `lorebook` toggle. **Mechanics:** ONE
`useAppForm` over `rpgGameConfigSchema` + `form.FormGroup` per step with per-step Zod schemas
(`onGroupSubmit` advances; the full schema validates on final submit) — the documented multi-step
pattern, inside `createSavedEntityForm` (the ≥3-fields-or-validation trigger makes the factory LAW —
gate `form-factory-for-multifield`). Submit → **`rpg.createGame`**, which validates the chat's
resolved connection is tool-capable up front (05 §3) — surface its refusal verbatim and helpfully
("this room's model can't run a game — pick a tool-capable connection"). After create, the game
panel shows the `setup → ready` world-gen progress (a workload); `ready` → the host's "Begin
session 1" (`rpg.startSession`). *Rejected: a hand-rolled step component with local state per step
(the factory bakes draft persistence, seed guards, and reset — the six obligations); a single giant
form page (session zero is a conversation, not a tax form — marinara's step shape tested well).*

## 11. Failure affordances — the JSON-repair modal is DELETED

Marinara's ~10 `apply-json` repair-twin endpoints + the human JSON-repair modal do not exist here
(01 §5 DROP). Native tool-use makes the old failure mode invisible: a schema-invalid tool call
returns an error RESULT the model self-corrects inside the recurse loop (05 §3) — no user surface at
all. Structured completions (setup world-gen, session distill, director, encounter init) run as
Workloads with one bounded retry (03 §12); a hard failure surfaces as the **standard
workload-failure toast + a retry verb** on the owning surface (the wizard's progress state, the
session-wrap banner) — the same affordance every other workload already has. *Rejected: any "fix the
JSON yourself" affordance — it makes humans do machine work; the Tier-3b local-model polyfill is a
server-side concern with zero client surface.*

## 12. Not in v1 — "structurally OUT" vs "polish we WANT, doored" (do not conflate)

A cold reader mining marinara will find a much larger client. Two very different lists. The first
is mechanism conflicts with law — dead, do not re-import without a ledger decision. The second is
presentation polish the product WANTS ("make it pretty") — deliberately not v1, but each item is
client-only over data the server already ships, with its door named so nobody re-litigates the
mechanism later.

### 12.1 Structurally OUT

- **Client-side timers that tick and persist** (marinara's timer widget counted down in the browser
  and wrote `running:false` back) — a client writing game state violates the governing rule; the
  timer widget renders server values only (display interpolation off a server `endsAt` is fine —
  08 §7).
- **The `[direction:]`/inline-effect TAG MECHANISM** — the text-tag grammar is dead (05 §0). Any
  effect vocabulary arrives as typed signals (`RpgBusEvent`, `ToolCallRecord` bands) → a renderer
  (§12.2), never prose markup the client scrapes.
- **QTE overlays** — real-time reflex timers fight the async multi-human turn model (05 §3 #22
  rejection). *(Choice cards are NOT out — `offer_choices` IS tool #22 in the 05 registry; its chip
  renderer ships with C3. An earlier draft of this doc predated that tool.)*
- **The interrupt/force-interrupt button** — chat's own mid-stream STOP is the one interruption
  affordance (no duplicate).
- **Draggable/lockable floating panels** (`movingUI`) — the shell owns layout (D44 appearance);
  HUD collapse/pin covers the legitimate want.
- **`GameJsonRepairModal` + sidecar failure banners** — §11; workload toast + retry verb.
- **Spotify DJ / TTS barks / volume mixer** — the dropped media agents (01 §5); a future
  `domain/media` decision, not an rpg client surface.
- **A second text renderer** (typewriter `AnimatedText`) — streaming text is Streamdown + the pacer
  (D43); one renderer.

### 12.2 Deferred POLISH — wanted, doored (the optional C11 chunk)

All client-only, zero new server surface, zero law conflict; v1 skips them only because v1 proves
the game LOOP. This is the sanctioned pretty pass:

- **Scene backdrop** — the latest scene illustration as a softly-dimmed backdrop behind the game
  chat. The door is the D44 per-chat `ThemeScope.background` token axis (§8); until that axis
  lands, a "Scene view" panel tab rendering the latest `MessageMedia` large is the zero-risk
  interim. This recovers the best of marinara's VN presentation WITHOUT the VN layer.
- **Expression sprites at the table edge** — the committed expressions stage (D49, 09e) IS the
  sprite layer: the `ChatBusEvent` `{type:"expression"}` member (expressions-design 02 §4 — `type`,
  not `kind`; fires per turn for sprite-equipped characters once that set builds); the rpg slice
  mounts the sprite holder beside the HUD. Zero rpg server work.
- **Weather/ambience flourish** — subtle client-only gradient/particle treatment derived from the
  HUD's weather/time view data (rain streaks, night dimming). Respects `prefers-reduced-motion`;
  data already ships.
- **Cinematic moment effects** — screen shake on a fumble, letterbox on `encounterStarted`
  `isBoss`, a HUD pulse on `checkResolved` — driven off EXISTING typed signals, rendered via the
  `motion` lib (the D54 adopt-when-flourish candidate; this is precisely its named use case). A
  curated effect map keyed by event/band — not an 18-effect tag grammar.
- **The readables view** — a styled reading overlay (parchment/letter) for journal `item`/`note`
  entries and in-world documents; a render treatment over existing journal data.
- **Dice roll animation** — a brief dice-tumble on the dice chip before revealing the server-rolled
  result (the number NEVER changes — animation is theater over truth).

| # | Chunk | Contents | Size |
|---|-------|----------|------|
| C11 | polish pass (optional, after C10) | scene-view interim + sprite holder mount + weather flourish + effect map + readables view + dice animation | **M** |

## 13. Component test plan (Playwright CT, `.ct.tsx` at the `tests/client` mirror)

The D54 primitive-reuse gates all bind here: form factories for the wizard + the GM drawer's
clock/widget editors; `virtualizer-only-in-seal` (journal + inventory use `@orb/ui/virtual-list`);
the token gates on all rpg TSX; `no-media-queries-in-features`; `no-array-literal-querykey`;
`no-inline-invalidate-outside-seam` + `bus-onData-no-store-write` on `use-rpg-stream`.

- **`widgets.ct.tsx`** — every widget kind renders from an `RpgHudView` fixture; `<SegmentedClock>`
  at 0 / partial / full / completed; bipolar tier ticks; `dangerBelow` accent swap. Add
  visual-regression screenshots — the HUD is the highest-drift surface.
- **`tracker-locks.ct.tsx`** — lock glyph reflects `fieldLocks`; edit fires `rpg.editSnapshot` WITH
  auto-lock; the "keep unlocked" opt-out suppresses it; unlock toggle deletes the key; lock keys pass
  through opaquely (no path construction in the client — assert the exact server-given string).
- **`map.ct.tsx`** — the member fixture renders ONLY delivered geometry (assert an unrevealed node
  id present in the host fixture is ABSENT from the member DOM — the fog contract); host render dims
  unrevealed; party marker on both kinds.
- **`game-event-chips.ct.tsx`** — one `ToolCallRecord` fixture per tool → chip snapshot; the
  mapped-type registry is exhaustive by `tsc` (a new tool fails the build, not the runtime); band →
  intent-token mapping; the folded `<details>` line for bookkeeping tools; the user dice-text
  decorator on the canonical format (and NOT on lookalike prose).
- **`encounter.ct.tsx`** — initiative renders in server order (fixture deliberately unsorted-by-name
  to catch a client re-sort); HP meters; boss counterplay text; round log; the `RpgCombatSummary`
  card.
- **`wizard.ct.tsx`** — per-step validation gates advance; full-schema on final submit; the draft
  survives close/reopen (the factory obligation); the tool-capability refusal renders.
- **`non-game.ct.tsx`** — a `getGame → null` fixture mounts the chat surface with the rpg slots
  registered: assert ZERO rpg test-ids in the DOM and no `rpg.stream` subscription attempt.

## 14. Build chunks + sizing

Order: U1 → C1 first (primitives + data seams before surfaces — the §11.7 born-compliant rule);
C2–C10 parallelize after C1. Sizes: S ≈ a day-scale agent chunk, M ≈ a few, L ≈ split-on-contact.

| # | Chunk | Contents | Size |
|---|-------|----------|------|
| U1 | `@orb/ui` additions | `Meter` kinds (`arc`/`bipolar`) + milestones/danger · `<SegmentedClock>` (+ CT) | **M** |
| C1 | slice skeleton + seams | `features/rpg/` scaffold · the three chat registries + root wiring · `use-rpg-game` gate · `use-rpg-stream` + the invalidation map · mutation wrappers | **M** |
| C2 | HUD | strips/anchors + the 8 widget renderers + collapse | **M** |
| C3 | stream chips | `GAME_EVENT_RENDERERS` (all tools) + dice-text decorator + toasts | **M** |
| C4 | game panel core | Tracker tab + edit/auto-lock/lock toggles · Party tab · sheet drawer | **L** |
| C5 | map tab | grid + node SVG render, member/host projections | **M** |
| C6 | cast + journal + quests tabs | NPC roster, filters, infinite + virtual-list, note composer, quest groups | **M** |
| C7 | GM drawer | checkpoints (create/restore-confirm) · session controls + concluding banner · clock/widget editors · death confirm | **M** |
| C8 | composer affordances | dice popover + `/roll` + address toggle | **S** |
| C9 | encounter surface | panel takeover + initiative strip + summary card | **M** |
| C10 | setup wizard | the 4-step factory form + create/ready flow | **M** |
| C11 | polish pass (**COMMITTED** — D58; §12.2) | scene-view interim · sprite holder · weather flourish · effect map · readables · dice animation | **M** |
| C12 | GM console + GM-eyes (§15; after C7) | verb palette/forms · GM-eyes panel tab · seat controls | **M** |
| C13 | seat affordances (§16) | pending-check chips · GM message badge · wizard "who runs the game?" radio | **S** |

Theming (§8) ships no v1 chunk — it activates with the D44 per-chat scope axis (§12.2's scene
backdrop upgrades onto it when it lands).

## 15. The GM console + the GM-eyes panel (doc 12 — the human-GM surface)

**The console** grows the C7 GM drawer (host tools stay; seat tools join, each gated by what the
server lets the CALLER do — the drawer renders from a server-delivered capability list, never a
client-side role guess): a searchable **command palette** of the seat verbs (scene patch ·
advance time · clocks create/tick · NPC upsert/reputation · quests/journal · map edit/reveal ·
encounter start/round forms · loot · request-check · illustration) — each a small form over the
SAME tRPC verbs the AI's tools wrap (doc 12 frame: one vocabulary, two invokers), all through
`createEntityMutation`. *(Rejected: a D46 automation-action surface — automation is Phase 8 and
these are direct verbs; rejected: free-text GM slash-commands — forms over typed verbs beat a
grammar.)* **The GM-eyes panel** is a game-panel tab that mounts iff `RpgGmView` resolves for the
caller (the seat holder; host only while the seat is NULL — doc 12 §6): story arc secret · twist
bank · hidden clocks (`<SegmentedClock>` with a "hidden" treatment) · quest `gmNotes` · pending
checks. Spoiler safety is server projection — this tab renders what arrives, and for a playing
host with a friend GM, nothing arrives.

## 16. Seat affordances in the stream + wizard

The **pending-check chip**: `checkRequested` (bus) → the target player's client shows a banner/chip
("The GM calls for a Stealth check, DC 15 — Roll it / Decline") → `rpg.resolvePendingCheck` → the
server-minted `[check: …]` text posts as their message; the chip renders the band like any check
chip (§4). **GM message badge**: messages whose `authorUserId` is the current `gmUserId` get a GM
chrome badge (derived from the seat via `RpgGameView`, never from message text). **Wizard**: step 2
gains the "Who runs the game?" radio (AI · Me · A friend…) per doc 12 §7.

## 17. Cross-refs

01 (the loop this UI serves) · 03 §2.3/§8/§12 (locks, widgets, views) · 04 (the math the client must
NOT own) · 05 §3/§5/§6/§7 (tools, bus, dice text, address modes) · `core/UI-Architecture-and-Layout.md`
(shell, slices, tokens) · `UI-Gates-and-Lessons.md` §11 (seams + gates) · `UI-Primitives-and-Reuse.md`
§13 (the primitive catalog this doc composes) · `UI-Theming-and-Content.md` §12 (D44 trust tiers,
`ThemeScope`, `MessageMedia`).
