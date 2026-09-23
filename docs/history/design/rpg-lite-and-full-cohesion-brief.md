---
kind: history
status: archived
updated: 2026-08-01
---

# Design Brief — Making Orbweaver's RPG Cohesive, Dynamic & Extensible (Lite + Full)

> **Purpose:** a self-contained brief for a max-effort design pass. Produce a GAME PLAN that unifies
> orbweaver's full tabletop RPG and a new "lite" stats-steering mode into one cohesive, extensible
> design — without shoehorning every user into one hardcoded house system. Read this in full, then
> read the reading-set below IN FULL before planning.

## 0. The ask (one paragraph)

Orbweaver's RPG today is ONE opinionated house system (d20 + degrees-of-success + clocks + encounters

- GM seat), committed at ledger D58. It's good, but it shoehorns: you can't run a different stat system
  (Fallout SPECIAL, custom), and there's no "lite" tier for the far more common ask — *"give my character
  some spicy stats + inventory and let the chat reference and update them to steer the story,"* WITHOUT
  the full GM/dice/encounter machine. We want a game plan for a design where a **FULL** RPG (server-
  authoritative, tool-driven, dice/encounters/clocks/GM) and a **LITE** stats-steering mode share **one
  flexible foundation** — cohesive, dynamic, extensible, flowing through the same turn engine. The stat
  model must stop hardcoding the D\&D six. Decide the shape now: the schema is committed but **pre-launch**,
  so changes are cheap baseline regens today and painful migrations after ship — this window is closing.

## 1. Where we are (facts, verified against the tree)

- **The built RPG** = the `docs/architecture/proposed/rpg-design/` set (13 docs), committed at D58. A
  d20/5e-PbtA-Blades hybrid. Schema (14 tables) landed at `4075bf28` (R3). The R4 tool-call write path
  (20 tools + dispatcher + owning verbs) just built on `acda8ffe`.
- **Explicit non-goal today** (rpg-design 01 §6): *"No rules-system plugins… the mechanic set is THE
  house system; D46 Tier-2 plugins are the eventual extension point."* Alt-rulesets AND any lite tier
  are punted to the plugin program — **wave 7**, the far end of the queue.
- **The one hard rigidity** (rpg-design 03 §4.1): `RpgSheet.attributes` is a **fixed object**
  `{str,dex,con,int,wis,cha}` because the d20 check math assumes them. Right next to it, `skills` is a
  free-form `Record<string,number>`, `poolDefs` is custom pools, `abilities/strengths/weaknesses` are
  free arrays, and **custom HUD widgets** already allow arbitrary meters/counters/stat-blocks. So custom
  stat *names* work (via a 04 §2 alias map onto the six); a custom stat *shape* does not.
- **No lite tier exists.** It's the full `rpg_games` apparatus (setup wizard, GM seat, tools, encounters,
  clocks, sessions) or a plain chat. Nothing in between.
- **Pre-launch window:** rpg schema changes are `0000_baseline` regens (cheap) now; migrations after
  launch. Same for any new mode axis on `rpg_games`.

## 2. The problem, stated sharply

1. **Rigidity:** the sheet's attribute *shape* is hardcoded to the D\&D six; the mechanics assume it.
   Alt-stat systems (Fallout SPECIAL = 7 different attributes; freeform "spicy stats") don't fit.
2. **All-or-nothing:** "game-ness" is binary (an `rpg_games` row = the full engine). The lighter, likely
   higher-demand use case — a character sheet + inventory + custom trackers that *color a normal chat* —
   has no home short of standing up a full campaign.
3. **Cohesion risk:** if lite mode is bolted on as a separate subsystem, we get two overlapping
   state/prompt/sheet models to maintain. The goal is ONE foundation, two modes.

## 3. Prior art we mined — the Marinara SillyTavern extension

Full report: **`docs/history/reviews/misc/marinara-st-extension-lite-mode.md`** (READ IN FULL). Repo studied:
`github.com/SpicyMarinara/rpg-companion-sillytavern` (the flexible tracker *extension*, not her engine).
The three patterns worth stealing:

1. **Schema-as-data (single source of truth).** One editable `trackerConfig` object (custom meters,
   custom integer attributes, free-text fields, per-NPC fields/meters) drives prompt + parse + render.
   Zero code per stat; the D\&D six are just seed data. Nothing hardcodes an attribute set.
2. **Compile-inject-rewrite-parse loop.** The schema compiles to a JSON skeleton with placeholder holes
   - inline `//range` comments; injected as fake chat turns (prior state as a fake assistant msg,
     instructions as a depth-0 user msg); the model rewrites the JSON in its normal reply; a tolerant
     parser extracts it. Model-agnostic, no tool-calling. A field's LABEL doubles as a mini-prompt
     ("Corruption (0–100, how compromised)" steers better than bare "corruption").
3. **The steering line (the key insight — this IS the ask).** One instruction every turn: *"let the
   trackers color character behavior, dialogue, and the scene."* That single license is what makes a
   value actually drive behavior (horny-meter → acts horny; health-down → steers the story). Both
   directions: state→story (inject value + license) and story→state (model writes it back), per-NPC.

Also: swipe-safe (each swipe stores its own stats); schemas export as portable JSON; bind per-character.

## 4. Constraints the game plan MUST honor (orbweaver law)

- **Read `docs/architecture/core/AGENTS.md` in full first** — the constitution (package cake
  `kit←contracts←db←server←client`; 8-slot domain template; one-home; docs-are-law; KISS/YAGNI SUSPENDED
  for the architecture; tests central).
- **The four RPG pillars** (rpg-design 01 §1): P1 server rolls / model narrates · P2 one turn one path
  (a game turn IS a chat turn; no second pipeline) · P3 visible stakes / hidden hands (server-enforced
  projection) · P4 game-ness is DATA not a branch (`no-if(isGame)` in chat; injected ops that no-op).
- **Tools, not tags** (rpg-design 01 §5, 04 §deleted): the tag-grammar / model-rewrites-prose pattern was
  DELIBERATELY dropped for the full game in favor of D48 structured tool-calls, to stop the model owning
  syntax and kill the repair gauntlet. Any lite update mechanism must reckon with this precedent.
- **Reuse the built primitives, don't fork:** the party `sheet` (03 §4.1), snapshot swipe-keying (03 §2,
  `resolveSnapshotForTurn`), custom HUD widgets (03 §8, arbitrary meters), the 8 rpg prompt macros
  (06 §1), the D48 tool machinery + registry (just built), the Tier-3b textual-tool-call **polyfill**
  (local/weak models get tools without native tool support), and the preset/GATHER prompt-assembly path.
- **Local-model honesty** (owner doctrine, \[plan-for-small-hardware]): every model feature ships hosted +
  local honest arms or a visible capability refusal — never a silent degrade.
- **Pre-launch baseline-regen window** — spend it; don't design something that needs a post-launch
  migration to become flexible.

## 5. My analysis so far (INPUT — weigh it, don't just adopt it)

- **The convergence:** a flexible **schema-as-data sheet** fixes the hardcoded-six rigidity for BOTH the
  full game and lite mode, and it's a cheap pre-launch regen now. This looks like the load-bearing move
  regardless of the lite-mode outcome. The open hard part: the d20 check/encounter engines still need a
  *stat profile* — so generalize `attributes` to a data-defined set with a **default d20 profile**, and
  define how the mechanics consume a variable stat set (the alias map is the seed of this).
- **Steal her flexibility + steering line; keep OUR structured updates.** Her model-rewrites-JSON is the
  exact pattern we dropped (01 §5). We don't need it: lite mode has NO server-authoritative math — the
  model authors the tracker values either way — so a structured `update_tracker`-style tool is just the
  clean wire, reuses the tool infra we just built, and degrades to local via the existing polyfill. Net:
  her schema-as-data + her steering line (the great parts), our tool-based updates (our principle + built
  machinery). **This is a genuine fork — the plan should decide it with rationale, not assume mine.**
- **Lite likely = a `mode` axis on the game** (`mode: "lite" | "full"`) that trims the dice/encounter/
  clock/GM apparatus and swaps the fixed sheet for the flexible one — keeping it in ONE rpg domain (P4),
  reusing snapshot/widgets/macros — rather than a separate lite subsystem. Verify this against cohesion.

## 6. Decisions the game plan must resolve (the real work)

1. **Stat-spine generalization.** How to make `RpgSheet.attributes` schema-as-data while the d20
   mechanics still resolve. The stat-profile model: default d20 profile + arbitrary profiles; how
   `substrate/check.ts` / the encounter engine consume a variable stat set; what the 04 §2 alias map
   becomes. Contract + persistence changes (pre-launch regen).
2. **Lite ↔ full relationship.** Mode axis on `rpg_games` vs a separate lighter path. Exactly what lite
   includes (flexible sheet, inventory, custom trackers, steering, macros, widgets) and excludes (dice,
   encounters, clocks, GM seat, sessions?). Whether/how a lite game can graduate to full.
3. **Lite update mechanism.** Structured `update_tracker` tool (consistent, server-persisted, swipe-safe,
   local via polyfill) vs her lighter prose-rewrite. Decide with the local-model story explicit.
4. **The steering line.** Where it lives (preset section? `substrate/reminder.ts`? a lite system note),
   how it's per-entity/per-NPC, and how it stays user-tunable (the label-as-mini-prompt idea).
5. **Custom-stat DEFINITION UX + data home.** Who defines the schema (the card's `RPGStatsConfig`
   extension? a per-chat editor? a template/preset?), and where it persists (a contract schema; which
   table/column). Portability (export/import a schema) if wanted.
6. **Cohesion with the built state model.** How lite reuses snapshot swipe-keying, the widget bindings,
   and the macros; the shared sheet CONTRACT that both modes read/write; the projection rules (P3) for
   any hidden lite fields.
7. **The extensibility line.** Does the flexible stat-spine + mode axis get us to alt-rulesets
   (D\&D-pure/Fallout/custom) directly, or does true rules-system swapping still belong to the D46 plugin
   program? Draw the line explicitly — what's foundation now vs plugin later.
8. **Doc + ledger deltas.** This amends D58 and the rpg-design set (01 §6 non-goal, 03 schema §4.1,
   04 mechanics §2, likely a new mode doc). Specify the ledger entry and which docs change.

## 7. What a good game plan output looks like

- A cohesive design for the **flexible sheet + the two modes**, honoring §4 constraints, with each
  non-obvious call carrying its **WHY + the rejected alternative** (house doc style).
- Concrete **schema/contract changes** (pre-launch baseline regen) with the stat-profile compatibility
  model spelled out.
- A **build-chunk sequence** that fits the rpg-design build-plan (doc 10) + the cross-set `BUILD-QUEUE`
  wave model — what's a pre-launch schema regen vs a new chunk vs deferred-to-plugins.
- The **doc/ledger deltas** (the D-entry text, which rpg-design docs change and how).
- Explicit resolution of every §6 decision, each with rationale.

## 8. Reading set — read ALL of these IN FULL before planning (do not skim, do not sample)

- `docs/architecture/core/AGENTS.md` (the constitution).
- **The WHOLE `docs/architecture/proposed/rpg-design/` set** — run `tree docs/architecture/proposed/rpg-design/`
  and read every file, README first, then 01→12. The invariants are split across the set; the stat model
  is 03 §4.1 + 04 §2, the pillars are 01, the domain shape/injection is 02, the tool seam is 05, the
  GM/crew is 06, seats are 12. **Do not plan off a subset.**
- `docs/history/reviews/misc/marinara-st-extension-lite-mode.md` (this brief's prior-art source, in full).
- Ledger `docs/adr/` — D58 (the rpg commit), and scan for D18/D20/D24
  (scope/FK discipline), D46 (automation/plugin Tier), D48 (tool-use).
- This brief.

---

*Assembled 2026-07-17 from the rpg-design set + the Marinara extension research. The full RPG is built
through R4 (tool vertical, `acda8ffe`); lite mode + the flexible stat-spine are the net-new design this
plan must produce. Owner context: "we're shoehorning into one rpg system — I want D\&D-style / Fallout-
style / a lite version where someone uses spicy stats + inventory to steer the chat."*
