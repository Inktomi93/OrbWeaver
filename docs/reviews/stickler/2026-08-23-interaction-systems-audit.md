---
kind: review
status: draft
updated: 2026-08-23
---

# Interaction plan × existing systems — the underuse audit (Q1) and the split & capability model (Q2)

> **Provenance.** Owner-commissioned follow-up to the governing plan
> (`docs/history/reviews/stickler/2026-08-23-interaction-redesign-plan.md`, forks F1–F5 pending). Authored
> by **claude-b**; every load-bearing claim symbol-verified this session (receipts inline; negatives
> double-checked by literal grep). One stickler verification round run per the commission: 5
> confirmed findings (1 verdict-level: the refinery TRAP's authority premise refuted — roster cards
> are host-owned by construction; the verdict survives on re-argued grounds), all folded in this
> revision; the stickler independently CONFIRMED the audit's biggest structural claim (the tool-
> attach gap), the roster-union wall, the G8 swipe-fold claim, and the D19/D17 legend. Verdict
> vocabulary for Q1:
> **USED-WELL** (the plan already rides it, receipt) · **UNDERUSED** (a concrete plain-named OPTION
> for the owner — never a new commitment) · **N/A** (why it doesn't apply) · **TRAP** (wiring it
> here would be a defect; the refusal is the finding).

## Q1 — the underuse audit

### 1. kit/macro (metadata · diagnostics · `{{expr}}` · global variables) — USED-WELL, one free lever worth naming

- **USED-WELL:** the plan's chips and rule arms ride the macro engine without knowing it — the
  `surface_quick_reply` arm's `sendTemplate` is macro-rendered **at FIRE time, in the rule
  AUTHOR's env** (`runSurfaceQuickReply` renders via `renderArmTemplate` over the dispatch frame
  and publishes already-rendered strings on the bus — arm-executors.ts:131-143; the click then
  sends that pre-rendered text attributed to the clicking member), `transform_draft` runs a macro
  template over the draft, and `trigger_turn.guidedTemplate` is macro-rendered steering. S3
  presets therefore inherit the whole macro vocabulary (metadata, arg diagnostics, `{{expr}}`,
  `{{getvar}}`/`{{getglobalvar}}`) in every template field for free. (The contracts comment's
  "rendered at click time" clause describes message MINTING/attribution, not the render — the
  executor is the truth; preset authors must not read it as click-time state sampling.)
- **Free lever, with its semantics stated honestly:** a chip's sent text can be state-reactive
  (`{{expr::…}}` over `vars` — the CEL macro, builtin-metadata.ts:149) with zero new machinery —
  but the state is sampled when the chips SURFACE, not when one is clicked (a chip clicked three
  beats later sends fire-time values), and `global` in the env is the rule AUTHOR's namespace,
  never the clicking member's. No build item; a preset-authoring note.
- **N/A:** the autocomplete/`queryMacros` surface is editor tooling — G2 renders preset knobs, not
  a template editor, so it consumes none of it (the raw-editor path where it matters is the
  retired A8 shape).

### 2. @orb/kit/cel + the automation CEL env — USED-WELL; the knob mechanism decided

- **USED-WELL:** S3 predicates are constant CEL sources validated by the existing
  `createRule` parse refusal; the env vocabulary (`event`/`vars`/`choice`/`global`/`chat`/`now` —
  contracts/automation/index.ts:303-320) covers every preset in the plan's list: `now.hour` for
  time windows, `event.turn.automationDepth` for cascade honesty, `vars` for counters.
- **Decision (how preset knobs meet predicates): SUBSTITUTE AT MINT.** `createRuleFromPreset`
  interpolates knob values into the preset's CEL source as literals before the normal
  `createRule` parse (e.g. "every N beats" → `int(vars.beat_count) % 12 == 0`). *WHY:* the minted
  rule is self-contained and diffable, detaches cleanly on edit, and re-uses the parse refusal as
  the validation floor. *(Rejected: binding knobs through the env's `choice` plane — that plane is
  ChoiceBlock config picks with its own merge semantics (:307), and routing rule knobs through it
  couples two config systems for no gain; rejected: exposing raw predicate fragments as knobs —
  the "boring admin console" failure wearing a smaller hat.)*

### 3. The refinery (run-stage · iterate · score-sweep · apply-fields/as-copy · schema forge) — TRAP for this program; already the carrier of a purged capability

- **TRAP, argued** (the verdict survives round-1 review; its ARGUMENT changed — the stickler
  refuted the first draft's authority premise: roster characters are HOST-OWNED by construction
  (`addCharacterToChat` resolves the card owner-scoped to the host, chat/verbs/roster.ts:521-527
  "A roster character is always host-owned"; handoff drops seats the new host doesn't own,
  :775-790), so the host confirmer COULD execute. The refusal stands on three grounds that don't
  need the false premise:
  1. **Room events must not mutate cross-room library identity.** A character card is a library
     artifact shared by every room it sits in; a rule in ONE room rewriting it from that room's
     events reaches outside the room's own state — the room/library line the saved-rosters design
     names as the boundary this class of feature exists to respect.
  2. **The workshop IS the product.** Refinery is a deliberate multi-stage session
     (start → run-stage → iterate → score → apply, with the pre-apply snapshot); a one-click
     confirm card collapses that into an unreviewed side effect — the "boring admin console"
     failure inverted: the depth is the point, and a card can't carry it.
  3. **The crew prose-audit lesson, directly:** automatic in-room prose critique was the named
     turn-hold anti-pattern (D59's "strictly post-turn async" hedge existed because the shape
     tends toward holding turns), and each suggestion is a per-event summarize-role spend for
     output nobody asked for at that moment.
     The refinery keeps its own workshop UX; this program does not touch it.
- **What IS true (recorded for Q2c):** refinery already carries the purged crew card-evolution
  capability — propose-don't-dispose card improvement with a pre-apply snapshot, human-initiated,
  owner-scoped (service.ts header: "the pre-apply snapshot and the apply write are all CHARACTER
  ops"). Nothing to build; the capability is not missing, it is homed.

### 4. kit/regex + regex placements — N/A

The plan's only text-transform lever is the rule-side `transform_draft` (D50 seam), which is
deliberately macro-templated, not regex. Regex scripts remain the content pipeline's own placement
system (`REGEX_PLACEMENTS`, homed in `@orb/kit/regex`; contracts/regex consumes it); no interaction
feature in the plan rewrites rendered
content. Nothing to wire, nothing left on the table.

### 5. World-info activation — UNDERUSED (two cheap preset options)

- **USED-WELL:** the plan's "auto-add lore entries" preset maps 1:1 onto the existing
  `insert_world_info_entry` arm (contracts/automation/index.ts:206-213) — no new arm needed.
- **UNDERUSED:** `worldInfoActivated` is a LIVE trigger (CHAT\_TRIGGER\_TYPES:29) whose fact carries
  the activated `entryIds` (:293-294), and no preset in the plan's list fires on it. Two options,
  both zero-machinery (existing trigger × existing arms): **"illustrate on lore reveal"**
  (worldInfoActivated → `generate_image`) and **"react to lore activation"** (worldInfoActivated →
  `trigger_turn` with a guided template). Owner options for the S3 preset table, not commitments.

### 6. search / embeddings / discovery / chat-memory recall / databank — N/A, with the trap named

`{{memory}}` and `{{databank}}` are already staged assembly sections
(domain/chat/assembly/assemble.ts:370 `SERVER_MARKERS = ["compact_summary","memory","databank",
"guided_instruction"]`) — every turn the plan's grafts steer already rides retrieval. The plan
correctly adds no retrieval consumer: chips-from-memory or suggestion-from-search would each be a
per-event model/retrieval call minting a new spend surface inside the room loop — an engine for
what the assembled prompt already covers. Discovery stays owner-plane analytics (the
Knowledge-Cluster fence: analytics ≠ retrieval); no room surface may consume it.

### 7. The workloads engine (WorkloadContribution slots) — N/A, argued

Nine domains contribute workload kinds today (`domain/*/workload-contributions.ts` ×9, verified by
listing); the engine is for per-user singular/bulk JOBS — progress, locks, cancel. Nothing in the
plan is that shape: rule dispatch is the automation watcher's own inline path, suggestions are an
in-RAM TTL map, reactions attribution is assembly-time, chips/cards are clicks. The one borderline
candidate (a refinery batch consumer) is refused in row 3 on room/library and product grounds,
which moots its workload question too. Adding a workload here would be mechanism-shopping.

### 8. The structured role + `runStructuredTurn` (D109-4) — USED-WELL indirectly; one priced option, default NO

- **USED-WELL:** the plan's model-calling arms already ride the sanctioned quiet/structured lanes —
  `set_chat_background` runs an LLM quiet-pick through the arm's `summarizeQuiet` op
  (arm-executors.ts:281), and the rpg state round rides `structured` per D109. The plan mints no
  new structured consumer — correct under "no engines for what narration covers."
- **Priced option, default NO — "model-suggested quick replies":** today `surface_quick_reply`
  choices are STATIC host-authored templates (contracts:216-221). A generated-chips arm (model
  proposes 2–4 replies each beat) is buildable on `runStructuredTurn`, but it is a PER-EVENT spend
  surface with a per-turn latency tax, and its capability gating inherits the §4 cell-keying
  honesty limit (Q2b). Recorded as an owner option with its cost stated; the plan's static-template
  default stands.

### 9. The tool registry + the per-turn ATTACH seam — USED-WELL on execution; ONE real gap

- **USED-WELL:** execution-side, everything routes through the ONE registry and execute path
  (G-I3's `react` tool; S4 confirms re-entering the front-door ops; G7's dice chip calls the
  member-gated `rollDice` VERB — server CSPRNG, bake-once — so it needs no tool attach at all).
- **GAP (the audit's one structural finding on the plan):** per-turn tool ATTACH on a PLAIN chat is
  unwired — `attachedToolNames: rpg?.tools ?? []` (domain/chat/verbs/turn.ts) is the only attach
  source, and D109 pins rpg's own gather to `tools: []` in every mode, so today NO tool ever
  attaches to a plain chat turn. G-I3/MR5 (a character calls `react` during its turn) therefore
  needs an attach decision the plan never states. **Option (fits the plan's own shapes):** S2's
  `TeachingContribution` gains a `toolNames` axis alongside `injections` — teach and attach travel
  together, mirroring the rpg gather result shape, and the existing capability-honesty drop
  (`tools_unsupported`, engine/pipeline.ts) gates it per turn. Scoped to MR5's build; until then
  MR5 is the one ladder row with an unbuilt prerequisite, and the plan's G-I3 cell should say so.

### 10. Guided-actions / the steer system — USED-WELL; the standing/one-shot pairing stated

`trigger_turn.guidedTemplate` rides the guided steering channel (the receipt is the automation
plugin's turn request — `guided: { action: "response", input }`, automation-plugin.ts:115, fed
from arm-executors.ts:207), so the "periodic pacing nudge" preset IS a guided-actions consumer.
G1's standing offer-choices knob has a one-shot sibling — the composer wand's "Offer choices" —
but **that item is GAME-ONLY today** (it renders only when `game !== undefined`, inside the wand's
game-gated Plot group — composer-utility-menu.tsx:214-229; reminder.ts:124's "covers the
this-turn-only ask" is written in the game-cyoa context). So on the plain chats G1 targets, the
one-shot does not yet exist: extending the wand item to non-game chats is either part of G1's
build or a named owner option beside it, and whichever lands, both paths teach from the SAME prose
slot (the non-game sibling of `rpg.reminder.cyoaTeach`) — one voice, knob-standing vs
wand-momentary.

### 11. Preset prose slots / TEMPLATE\_DEFS — USED-WELL

The plan's delta 2 already pins teach text to `PROSE_SLOTS` (preset-editable, baseline-pinned,
Templates-tab-surfaced — commit 4a5bb8e86). Nothing further; the enforcer (slot-reachability
through TEMPLATE\_DEFS, `contracts/preset/prose.ts`) comes free with the slot.

### 12. The bus taxonomies (chat · domain · feature · automation) — USED-WELL, cost counted honestly

No new BUS is added, but the plan adds **two new bus MEMBERS**, not one: `reactionsChanged` on the
chat bus (the reactions spec's canon argument, three-coupled-sites law), and — corrected in round
1 — a suggestion event on the automation bus for S4: the live `AutomationBusEvent` union
(quickReplySurfaced | ruleFired | ruleErrored | ruleAutoDisabled | rulesChanged,
contracts/automation/index.ts:341-348, belt-pinned) has no member that can carry a host-only
confirm card (`quickReplySurfaced` is the one member-visible event; the rest are id-only
lifecycle). S4's build cost therefore includes: the new union member + its belt entry + the
bus-coverage coupled sites + a HOST-TIER filter arm at `transport/trpc/stream/sources/
automation.ts` (where member-tier filtering already lives). Ordinary merge class — the bus union
is contracts vocabulary, not the db-CHECK-coupled `AUTOMATION_FIRE_OUTCOMES` tuple. The
taxonomies themselves are the right homes throughout; nothing rides the wrong bus.

### 13. Imagery substrate (modes · provenance · reuse) — USED-WELL + ONE missed preset

- **USED-WELL:** G-I1 consumes exactly the unwired frontier (editImage / extractPrompt /
  readProvenance, transport-wired, zero client consumers) and the `background` prompt-template
  mode (`PROMPT_TEMPLATE_MODES`, contracts/imagery:17) backs set-as-background.
- **UNDERUSED:** the `set_chat_background` arm EXISTS (contracts/automation:169, :237-247 — the
  autobg LLM quiet-pick over the host's owned background library) and the plan's preset list never
  names it. **Option: an "auto-set scene background" preset** (e.g. `worldInfoActivated` or
  scene-change predicate → `set_chat_background`) — zero new machinery, pure S3 data row.

### 14. Global/chat variables as G8's state plane — the headline underuse finding

The plan's G8 ("clocks — SegmentedClock + an S3 preset (fires-when-full)") never states where
clock STATE lives. It needs NO new plane: automation variables already are it — `set_variable`
with `op: inc` (contracts:194-200), the fold-cached `vars` env the predicate reads
(:305-310), and a preset predicate `int(vars.doom) >= 8` firing the action. The clock UI renders
the variable; a host reset is `set` back to 0. *(Rejected: a clock table or an rpg-plane borrow —
rpg's snapshot plane is swipe-keyed game state; a plain-room clock is room state, and the variable
plane's swipe semantics — chat vars fold along the selected lineage — are already the correct
rewind story. A new table for a counter is the god-surface reflex.)* This closes G8's open edge
and should be folded into its ladder row at build time.

## Q2 — the split and the capability model

### (a) MEMBERSHIP vs EXECUTION — the two columns, and the wall between them

| MEMBERSHIP (who is in the room) | EXECUTION (what takes a turn / performs an action) |
| - | - |
| characters (roster seats) | the turn pipeline (send / regen / `trigger_turn`) |
| personas (a human's `{{user}}` face) | automation rules (watcher → predicate → arms) |
| host / members (`chat_participants.role`) | plugins (membrane-bounded host-fn calls) |
| — the vocabulary is CLOSED — | registered tools (registry execute path) |
| | suggest/confirm (S4 pending → host click) |
| | chip clicks / reactions (member verbs) |

**The wall: NOTHING in the execution column is ever a room actor.** This is compile-enforced, not
aspirational: the roster's member vocabulary is a closed discriminated union whose ONLY live arm is
`character` (`rosterMemberSpecSchema`, contracts/chat/roster.ts:92-99 — `human` is deliberately
unrepresentable, `observer`/`agent` arms purged), and the cast producer's kinds are the closed
D137 `CAST_KINDS` axis. A rule, plugin, tool, or suggestion has no seat, no cast entry, no
speaker identity — it acts THROUGH a human's authority or not at all.

**Where each execution path gets its authority:** the turn pipeline — the D19 triple resolved at
the entry seam; automation rules — the RULE AUTHOR's standing authority (`authorUserId =
rule.ownerId` threaded through every arm executor — engine/dispatch.ts:159, arm-executors.ts
throughout — and rules are host-authored, so the author IS the room's host); plugins — the
INSTALLING principal, never more (the membrane's PL-C rule, tool-use/contract/params.ts:75);
tools on a turn — the turn's resolved host Principal via the exec frame; S4 confirms — the
CONFIRMER's Principal, gates re-run fresh; chip clicks and reactions — the CLICKING member's own
Principal, which is why neither needs a new authority mechanism at all.

### (b) The authority/capability table

Legend: D19 triple = `Principal.userId` (authenticated caller) · `triggeredBy` (the human
responsible — spend/abort/attribution) · `runAsUserId` (the host whose creds fund). D17 = hosted
credentials are owner-only, non-owner use needs explicit consent, fail-closed.

| Action class | Principal | triggeredBy / runAsUserId | Deciding gate(s) | Wire capability |
| - | - | - | - | - |
| rule arm, direct (non-model: `set_variable`, `insert_world_info_entry`, `surface_quick_reply`, `post_notification`) | the rule AUTHOR (standing authority; `authorUserId`) | n/a (no turn) | `createRule` validation + the arm's own injected-op gates + fire budgets | none (no model call) |
| rule arm, model-calling (`trigger_turn`, `generate_image`, `set_chat_background`) | the rule author | `trigger_turn`: triggeredBy = the rule AUTHOR (the funder — automation-plugin.ts:112 `funderUserId: req.authorUserId`, turn.ts:2496-2498; = the current host, re-proven per fire by `holdsAuthority`, dispatch.ts:115-128); runAs = the host box. `generate_image`/quiet-pick: no turn triple — the arm runs whole under the author's resolved principal | budgets (cooldown / per-hour / spend $) + depth cap (the `automationDepth` fact tracks the cascade) + **D17 consent, fail-closed** on hosted creds | resolved per role: `trigger_turn` = the chat pipeline's own capability handling; `generate_image` = the imagery role resolve; the quiet pick = summarize |
| confirmed suggestion (S4) | the CONFIRMER (host) — never the rule's autonomous lane | triggeredBy = runAs = the confirmer | host-gate on confirm + re-validation + the target op's OWN gates re-run under the confirmer | whatever the confirmed op resolves (same as if the host had invoked it directly) |
| plugin host-fn call | the INSTALLING principal | per the invoking event's chain | manifest grants → `can()` / `fetchOwned` / D17 mapping (the membrane's enforcement map) | n/a (plugins reach models only through granted ops that resolve their own roles) |
| tool invocation on a turn | the turn's resolved host Principal (`ToolExecutionContext.principal` + `triggeredBy`, tool-use/contract/params.ts:31-32) | the turn's D19 triple, inherited (D109-2: out-of-turn rounds ride the turn's RESOLVED connection + consent — never a re-resolve) | the tool's `capability` ceiling + the owning verb's gates | `capability.tools` gates ATTACH (pipeline drops tool-less with `tools_unsupported`) |
| chip click (send mode) | the clicking member | caller = triggeredBy (a direct send); runAs = host | membership (a non-member has no room) + turn arbitration | the ordinary turn resolve |
| chip click (compose / execute mode) | the clicking member | n/a / the executed op's own | the op's own gates (execute); none (compose — a draft write) | none |
| reaction toggle | the clicking member (attributed to their participant seat) | n/a (not a turn; no lock) | membership floor (`requireParticipant`) + the junction's unique constraint | none |
| offer-choices teach (G1) | none — prompt text has no authority | n/a | the knob WRITE is host-gated; the teach line itself is inert | none |

**The §4 cell-keying problem, located:** capability is source/model-keyed while real tool-ability
is cell-keyed (source × api) — the pain doc's measured divergence. Where it touches this plan:
exactly ONE row — tool ATTACH (and therefore MR5's react tool, plus rpg cheap mode today). Every
other model-calling path rides a role dispatcher or the chat pipeline, which already own their
degrade stories. **The plan needs NOTHING from fixing it:** the existing attach honesty
(`capability.tools` declared ⇒ attach; else drop + warn) is the same accepted limit rpg lite
ships under. Recorded so MR5's builder inherits the known limit knowingly; fixing cell-keying is
provider-tier work outside this program.

### (c) The purged concepts — where each CAPABILITY lives now (so nobody re-derives them)

| Purged concept (name stays dead) | Its capability | Carried NOW by | Status |
| - | - | - | - |
| crew lorebook-keeper | auto-add lore entries from play | `insert_world_info_entry` arm + the S3 "auto-add lore entries" preset (host-authored standing authority) | LIVE arm; preset = S3 |
| crew director (pacing) | periodic prompt-side pressure | `trigger_turn.guidedTemplate` + the "periodic pacing nudge" preset | LIVE arm; preset = S3 |
| crew director (secret arcs) | hidden GM plane in plain rooms | **nothing — stays DEAD.** Hidden-vs-surface state is rpg's deception system, one consumer, exporting only teach lines + the visibility contract (the plan §2) | dead |
| crew prose-audit | post-turn prose review | refinery's workshop (owner-initiated, own surface); the AUTOMATIC in-room version stays dead (turn-hold anti-pattern + the row-3 authority trap) | carried (manual) / dead (auto) |
| crew card-evolution | propose-don't-dispose card improvement | refinery `apply-fields`/`apply-as-copy` with the pre-apply snapshot (owner-scoped, human-initiated) | carried |
| buddy / crew observer loop | background AI watching a chat and acting | the automation WATCHER — rules are the observer, minus the persona, minus the seat | carried |
| buddy propose/confirm trio | act-only-with-consent | S4 — the three postures over rules (plugins post-#24); confirmer's Principal executes | carried (recreated) |
| echo-chamber | ambient multi-voice chatter | nothing — dead (was already "subsumed by buddy," and buddy is dead) | dead |
| agent principals (#13) | an AI with its OWN principal/ceiling | **parked whole on the owner's explicit want** — no partial carrier, deliberately; nothing in the plan depends on it | parked |
| agent tool-propose (#14) | propose-flavored tools for a seated agent | superseded by S4's recreation; the spec stays as the historical argument | superseded |
| crew structured-output-only rule | "an actor is not a proposer" — pure schema output | `runStructuredTurn` + the `structured` role (D109-4), consumed by refinery/discovery/rpg extraction | carried |
| GM seat | standing per-game authority object | dormant DDL (`rpg_games.gmUserId` born nullable) — a full-mode graft, untouched by this plan | dormant |

## Bottom line

The plan uses the tree's leverage well where it matters most (macro-rendered arm templates, the
guided channel, PROSE\_SLOTS, the one tool registry, the tiered automation bus) and correctly
REFUSES the two tempting couplings (refinery-in-room: a room event must not mutate cross-room
library identity, and the workshop's depth is its point; retrieval-fed chips: a spend engine for
what assembly covers). It leaves four concrete options on the table, all zero- or near-zero
machinery: worldInfoActivated presets (×2), the auto-background preset, and variables-as-
clock-state for G8 — plus ONE structural gap it must absorb before MR5: the per-turn tool-attach
seam for plain chats (the S2 `toolNames` axis option), and one honestly-counted cost: S4's
suggestion event is a NEW automation-bus member with its belt/coverage/transport-filter coupled
sites. Q2's split holds compile-enforced (the closed roster union), the authority table has no
empty cells after the round-1 corrections (trigger\_turn's triggeredBy = the author-as-funder),
and the cell-keying problem touches exactly one row and demands nothing.
