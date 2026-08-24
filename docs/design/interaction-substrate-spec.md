---
kind: design
status: archived
updated: 2026-08-23
---

> **SUPERSEDED (2026-08-24)** by [`interaction-direction-spec.md`](interaction-direction-spec.md) —
> the panel-verified RULED final (all seven forks + the handoff call decided). This draft was the
> commissioning input; kept as provenance only.

# INTERACTION SUBSTRATE + GRAFTS — the core-first carve for the interactive-story direction

> **Commissioned by the owner 2026-08-23** after the full proposed-corpus re-derivation (all sixteen
> future rows re-verified at symbol level that day). Method is the `lite-plus-guided-substrate-spec.md`
> carve discipline applied to the whole direction: **one small core built first, every feature an
> additive knob-gated graft that lands byte-identical-when-off and is testable by itself**, so the
> owner can land, poke, and judge one piece at a time. Constraints are the
> `Agent-And-Composition-Pain-Points.md` sins, now binding. `legacy-main` is a read-only semantics
> reference cited per read — nothing is ported from it (the 2026-07-26 rebuild ruling stands).
>
> **Owner rulings folded at commissioning (all final):**
>
> 1. **No anthropomorphized / cutesy feature framing, ever.** Features are named for what they do.
>    The room's actor vocabulary is CLOSED (characters, personas, host/members) — no new named
>    entity kinds. Crew is DEAD SCOPE (D59 disposition + the 2026-07-30 ruling); agent principals
>    stay parked on the owner's explicit want and are never pitched as a next step.
> 2. **Core first, piecemeal after** — the owner tests each graft alone.
> 3. **Consistency by PROMOTION, not duplication**: where rpg-lite already spells a mechanism the
>    core generalizes, the core is extracted FROM rpg-lite (rpg becomes consumer #1, byte-identity
>    pinned), never built beside it.

## §0 Binding constraints (the pain inventory, restated as law for this program)

- **No god-surface**: nothing in this program may be a feature that must know about everyone.
  Every cross-feature seam is a registry (thin core + per-thing descriptor — the shape the pain
  doc's §7 names as the one applied inconsistently). A core piece that grows an import per consumer
  is the defect, not the plan.
- **No vocabulary additions**: no new word for anything that takes a turn or sits in a room.
- **No client feature minted to mirror a backend domain** (§7's mirror sin). Client surfaces hang
  off the existing contribution anchors (`message-footer`, `above-composer`,
  `CHARACTER_DETAIL_ANCHORS`, the chat-context registry).
- **No engine for what narration covers** (the full-rpg lesson): state only what a surface renders.

## §1 The core — three pieces, built once, each green alone

### C1 — the in-chat control seam

ONE render slot + behavior contract for transient interactive elements near the transcript/composer,
as a registry over the EXISTING anchors. Control kinds register a descriptor (render + click
semantics); the seam owns the shared behavior: disabled-while-turn-runs with the reason on title,
send-vs-compose consumption, one visual language.

- **Promotion, not invention:** the click/consume half already exists as
  `choice-send-provider.tsx` (send vs compose, busy from the shared turn phase). C1 generalizes
  THAT contract; the CYOA fence renderer does NOT move (see §2).
- *Why a registry:* quick-replies, reactions, check chips, and confirm cards (§3) are four
  consumers of one interaction grammar; four bolt-ons is the pain doc's fragmentation sin.
  *(Rejected: folding the `:::choices` fence renderer in — a fence is CANON, part of the message,
  owned by the content pipeline's fence registry; chips are transient system surface. Two planes,
  one behavior contract.)*
- **Test alone:** CT mount of the seam with a synthetic descriptor + one live-chat drive with a
  hand-fired `quickReplySurfaced` event (the automation bus channel is already live and dormant).
- **Merge class:** ordinary (no schema).

### C2 — the model-teaching seam

ONE home for "what this chat's model is told it can do" — assembled per chat from registered
contributions. **Built by extracting rpg-lite's reminder assembler** (`domain/rpg/substrate/
reminder.ts` — steering license, CYOA teach, deception teach, omniscience teach): the assembly home
becomes core, rpg re-registers its lines as contributor #1 with content unchanged.

- *Why extraction:* a second teaching path beside a working one is the exact two-homes drift the
  pain doc catalogs; the reminder is already per-mode, per-chat, injection-delivered.
  *(Rejected: a new core seam beside the reminder — mints the drift; rejected: leaving teaching
  rpg-local — the offer-choices toggle and rule/plugin teaching lines need the same home.)*
- **Tests alone:** (a) the byte-identity pin — an rpg chat's assembled prompt is IDENTICAL before
  and after the extraction, per mode; (b) a non-game chat with zero contributions assembles
  byte-identical to today.
- **Merge class:** ordinary; the extraction commit is behavior-frozen by (a).

### C3 — rule presets as data

A preset table (plain functional names ONLY — "auto-add lore entries", "periodic pacing nudge",
"auto-illustrate scene changes", "dice chips after a beat") mapping to the built automation engine:
trigger + predicate + arms + the small knob set each preset exposes. One verb
`createRuleFromPreset`. NO UI in this piece.

- *Why data-not-UI first:* the engine (A1–A7) is proven; a preset is a row the existing `createRule`
  validation already gates. The UI graft (G2) then renders data instead of encoding product.
  *(Rejected: shipping the raw rule editor first — the recorded "boring admin console" failure.)*
- **Test alone:** create-from-preset via tRPC → the rule fires end-to-end on a real chat event →
  fire log records it. Budget defaults ride the existing `automation_budgets` seeds, invisible.
- **Merge class:** ordinary (presets are code-shipped data, not schema).

## §2 Promotions and exported contracts (the rpg-lite consistency pass)

| What | Disposition |
| - | - |
| lite reminder assembler | PROMOTED to C2; rpg = contributor #1; byte-identity pinned |
| `:::choices` fence render | STAYS in the content pipeline (canon plane) — untouched |
| choice click semantics | PROMOTED to C1's behavior contract; the fence block + Scene-tab echo consume it; chips match its visual language |
| lie/truth (deception) system | STAYS rpg-owned (one consumer; generalizing now is the fourteen-engines sin). TWO exports only: its teaching lines ride C2, and its **visibility contract** (what a non-host may ever see) is written as a short contract section any future read surface (chronicle view, export, search) MUST consume — never re-derive. Generalizes the day a second feature wants hidden-vs-surface state. |

## §3 Propose/confirm, recreated without agents (the #14 fold)

`agent-tool-propose-spec.md`'s three-posture law SURVIVES; its subjects change. The postures, with
today's actors:

1. **Standing authority ⇒ act directly** — a host-authored rule within its arms and budgets; a
   plugin within its grants.
2. **No standing authority ⇒ propose + confirm** — a rule or plugin whose action exceeds its
   ceiling (or whose preset is marked confirm-first) emits a SUGGESTION: a confirm card in the C1
   seam ("add this lore entry?", "illustrate this scene?") that the HOST clicks to execute under
   the host's own authority. The card is transient (the quick-reply model); the confirmed action
   runs through the same front-door op it always would.
3. **Structured-output-only ⇒ no tools** — unchanged (D109's structured role).

*Why this recreation:* the spec's mechanism was sound; its cited seams (agent seats, crew
proposals) are purged. Rules and plugins are the live actors that want above-ceiling actions, and
the confirm card needs exactly nothing new — C1 renders it, the automation/plugin op tables execute
it. *(Rejected: reviving any agent-principal machinery for this — an inhabitant-first rule the
owner has made explicit; #13/#14 stay parked.)*

## §4 The grafts — each lands alone, owner-testable, stop-anywhere

| # | Graft (plain name) | Rides | The owner's test | Merge class |
| - | - | - | - | - |
| G1 | offer-choices toggle (per-chat) | C2 | any chat: model offers, click lands in the composer | ordinary |
| G2 | rules list + preset picker | C3 | enable "auto-illustrate", watch it fire; budgets invisible until a cap hits | ordinary |
| G3 | quick-reply chips | C1 | a rule surfaces chips; click sends as the clicking member | ordinary |
| G4 | confirm cards (§3) | C1 + C3 | a confirm-first preset proposes; host click executes | ordinary |
| G5 | message reactions (#23 as specced) | C1 (pills) + its own MR0 plane | react to a message; a character reacts via the tool arm | **merge-window** (db baseline) |
| G6 | imagery client (#22 I5) | existing imagery verbs | /imagine, preview→edit, set-as-background | ordinary |
| G7 | checks chip (game-mode arm) | C1 + the dice tool | "Roll Persuasion DC 12" chip → server roll → narration | ordinary |
| G8 | clocks (game-mode arm) | SegmentedClock + a C3 preset (fires-when-full) | a clock fills; the preset's action fires | ordinary |
| G9 | saved casts (#26 as re-derived) | chat roster verbs (D80 `setSeatKnobs`) | save a room setup; one click into a new chat | **merge-window** (schema) |
| G10+ | maps · chronicle read-view · hub-as-plugin · snippet runner | gated | maps after G7/G8 prove the appetite; chronicle after the §2 visibility contract; hub + snippets AFTER the D46 membrane security review (#24) | per item |

Sequencing is fun-per-effort with zero forward dependencies: any prefix of G1..G9 is a coherent
product. G5 and G9 schedule like any baseline change (dev-db drop, merge-window — the #533/#534
rule).

## §5 Finish-line for the standing programs (recreated to fit, not resumed as specced)

- **tool-use (`tool-use-design/`)** — DONE to its consumer frontier (T1–T4+T7 live; T6's gate live,
  its helper superseded by `runStructuredTurn`; T5's verb reserved). This program adds consumers,
  not chunks: G7's check chip and §3's confirmed actions run through the ONE registry. The recorded
  tool-picker criterion (committed doc §8 Q2) stays the flip trigger for `ToolDefinition` promotion.
- **automation** — the engine is done (A1–A7). A8 is REPLACED by C3+G2+G4 of this spec: presets as
  data, a plain rules list, confirm cards, one autonomy setting surfaced only on refusal. The old
  A8 admin-console shape is retired (#592 re-gates to this spec).
- **plugin** — the membrane is done (P1–P4+P6, escape suite). Its client half obeys ONE rule:
  **plugins have zero private surfaces** — plugin tools are registry tools, plugin transforms ride
  the D50 seam, plugin chips/cards ride C1, plugin teaching lines ride C2. The manager UI
  (install/grant/enable/log) and the snippet runner land AFTER the D46 security review (#24's
  wake), and land small.
- **agent-tool-propose (#14)** — folded into §3; the spec itself is superseded by this section and
  stays parked as the historical argument.

## §6 Dead and parked, without euphemism

Crew: dead (D59 disposition; owner 2026-07-30). Agent principals (#13): parked on the owner's
explicit want; nothing here depends on them. Full-rpg R6–R11: superseded as a plan — future
full-mode work is a graft spec over the lite spine per the 2026-08-23 re-derivation (D109 governs
the turn shape). Hub browse (#21): waiting on the adapter-home ruling + security review.
Expressions (#20), world-state (#29), spatial (#27/#595): unchanged parks; the chronicle read-view
(G10) is the only touchpoint and consumes, never re-derives, their state.

## §7 What the owner can do at each stop

After C1–C3: nothing user-visible changed (byte-identity everywhere) — the substrate is provable
but silent. After G1: every chat can offer clickable choices. After G2: rules exist as toggles that
do useful things. After G3/G4: the chat talks back with chips and asks permission when it should.
After G5: reactions. After G6: images without leaving the room. After G7/G8: dice with stakes and
visible countdowns. After G9: rooms are reusable. Each stop is shippable; none forecloses the next.
