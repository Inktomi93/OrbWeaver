---
kind: review
status: draft
updated: 2026-08-23
---

# Interaction redesign + stack — the claude-b counter-plan (owner-commissioned, 2026-08-23)

> **Provenance.** Commissioned as the second, independent pass on the same assignment the primary's
> `docs/design/interaction-substrate-spec.md` answers. Authored by **claude-b** against the full
> commissioned reading set (the primary's draft · `Agent-And-Composition-Pain-Points.md` ·
> `lite-plus-guided-substrate-spec.md` · the routed proposed sets · D59/D109/D137/D80), with the
> tree facts spot-checked at symbol level this session (receipts inline). Iterated with the
> stickler role through TWO adversarial rounds (round 1: 8 confirmed findings, all folded in;
> round 2: per-finding verification, CONVERGED after two prose-echo fixes). The primary's draft is
> INPUT — §6 states every delta explicitly.
> Owner rulings folded at commissioning (verbatim-critical, all final): plain functional names only;
> the room's actor vocabulary is CLOSED (characters, personas, host/members); crew is dead scope and
> agent principals stay parked on the owner's explicit want; core first, grafts landed and tested one
> at a time, any prefix shippable; consistency by PROMOTION from rpg-lite, never duplication; the
> reminder assembler is the teaching seam's origin (rpg = consumer #1, byte-identity pinned); choice
> CLICK semantics generalize while the `:::choices` fence renderer stays in the content pipeline;
> deception stays rpg-owned exporting only teaching lines + a visibility contract; legacy-main is
> read-only reference; no god-surfaces, no client mirrors of backend domains, no engines for what
> narration covers.

## §0 Binding constraints (restated as this program's law)

Same four the primary states, adopted verbatim — no god-surface (registry-or-nothing for every
cross-feature seam), no vocabulary additions, no client feature minted to mirror a backend domain,
no engine for what narration covers — plus two this plan adds teeth to:

- **Every seam names its enforcer** (constitution §2.3: a prose-only boundary is a wish). §1's table
  has an ENFORCER column; where the honest answer is "review-tier only," it says so instead of
  gesturing at a gate that doesn't exist.
- **Every byte-identity claim names its pin.** "Byte-identical-when-off" is the carve method's load
  bearing wall (`lite-plus-guided-substrate-spec.md` throughout); each core piece below lists the
  identity test that would go red if the wall cracked.

## §1 The core — three seams, built once, each green alone

| Seam | What it is | HOME (package/tier) | ENFORCER (the tier that goes RED) |
| - | - | - | - |
| **S1 — in-chat control seam** | one registry + behavior contract for transient interactive controls near the transcript/composer (chips, confirm cards, check chips); generalizes the click/consume contract `choice-send-provider.tsx` already spells | descriptor types + control-kind union: `@orb/contracts/automation` (wire payloads) + the chat feature's composition tier (`packages/client/src/features/chat/` — D70 registry tier); ONE mount per anchor consuming ONLY the registry | compile: `CONTROL_KINDS` union + exhaustive `Record<ControlKind, ControlDescriptor>` (a new kind without a descriptor is tsc-red); structure: the anchor mount renders registry output only, so a bolt-on has no anchor without touching the ONE mount (review catches the one-file diff); test: CT mount matrix per kind |
| **S2 — model-teaching seam** | ONE per-chat assembly of "what this chat's model is told it can do," collected from registered contributions and delivered on the existing injections merge; rpg's reminder is contributor #0, its output byte-unchanged | contribution type: `domain/chat/contract/` (assembly vocabulary); per-domain contribution modules (`domain/<x>/teaching-contribution.ts` — the D117 workload-contributions slot pattern, type-homed here rather than contracts on the live `ChatRpgOps` sideways-type precedent); registry assembled at `entry/compose`; teach TEXT stays in `PROSE_SLOTS` (`@orb/contracts/prose`) | test: TWO byte-identity pins (§1.2); law: the convergence rule — all prose steering rides the ONE ChatInjection channel (`lite-plus-guided` §3.3, PD-63 one-placement); compile: contribution-id union + mapped Record totality; lint: a dep-cruiser stanza (contribution modules importable ONLY by `entry/compose`) — intra-package imports DO resolve, so the honest tiers are lint + review, not package physics |
| **S3 — rule presets as data** | plain-named preset rows (trigger + predicate + arms + a small exposed knob set) over the BUILT automation engine; one verb `createRuleFromPreset`; no UI in this piece | `domain/automation/contract/presets.ts` (data) + `verbs/create-rule-from-preset.ts`; preset-id tuple in `@orb/contracts/automation` | compile: `Record<RulePresetId, RulePresetDef>` exhaustive, def arms typed against the action-arm union (a retired arm fails tsc at every preset naming it); test: per-preset create→fire int test through the REAL engine (`createRule` validation re-used, never bypassed) |
| **S4 — suggest/confirm** (§3) | the #14 three-posture law recreated over rules (plugins join post-#24): no standing authority ⇒ a suggestion the HOST confirms; execution re-enters the same front-door path under the confirmer's Principal | `domain/automation` suggestion slice (pending map + verbs); payload wire shape `@orb/contracts/automation`; the card renders through S1 | compile: a NEW exhaustive Record over SUGGESTIBLE arms → summary renderers (a suggestible arm without one is tsc-red; the engine's own arm dispatch stays its deliberate switch); test: the authority matrix (non-host confirm refused; disabled rule voids its pending; confirm re-runs the arm's own gates under the confirmer); the fourth-posture redline restated in §3 |

### 1.1 S1 — the in-chat control seam

**Promotion, not invention.** The click/consume half exists: `choice-send-provider.tsx` owns
send-vs-compose consumption, its own `useSendMessage` (never racing the composer draft), busy from
the shared turn phase, and the compose default for non-game chats (file header, verified this
session). S1 lifts THAT contract into a descriptor registry so quick-replies, confirm cards, and
check chips consume it instead of re-spelling it. The `:::choices` fence renderer does NOT move —
a fence is canon, owned by the content pipeline's `DIRECTIVE_FENCE_NAMES` registry (D110-1); its
click handler stays a ChoiceSend consumer. Two planes, one behavior contract.

- *Why a registry:* chips, confirm cards, and check chips are three consumers of one interaction
  grammar (disabled-while-turn-runs with the reason on title; send/compose/execute consumption; one
  visual language); three bolt-ons is the pain doc's fragmentation sin (§7). *(Rejected: folding the
  fence renderer in — canon vs transient are different planes. Rejected: reaction pills as an S1
  consumer — see §6 delta 3; reactions are persistent canon anchored at `message-footer`, and
  neither half of S1's behavior contract applies to them.)*
- **Consumption axis is a closed union:** `"send" | "compose" | "execute"` — send fires a user turn
  (the choice-send path), compose drops into the draft, execute runs a mutation (confirm cards).
  Exhaustive dispatch; a fourth mode fails tsc. **Busy semantics are PER MODE, part of the
  descriptor contract:** `send` is turn-phase-disabled with the reason on title (a click mints a
  user turn — arbitration applies; the choice-send behavior today); `compose` is never disabled
  (a draft write races nothing); `execute` is disabled only while its OWN mutation is pending —
  never by turn phase (a confirmed action is a front-door verb call, not a turn, and takes no turn
  lock; suggestions routinely ARRIVE from turn events, so turn-busy would dead-zone them). *(Why
  this is spelled out: the same mismatch class is why reactions stay out of S1 — §6 delta 3; a
  seam whose busy rule fit only one mode would be the god-surface creeping in.)*
- **Test alone:** CT mount of the seam with a synthetic descriptor per consumption mode + one live
  drive with a hand-fired suggestion event (the automation bus channel is live). **Merge class:**
  ordinary.

### 1.2 S2 — the model-teaching seam

**The carve, precisely** (this is delta 1 vs the primary — §6): the extractable core is the
**per-chat contribution COLLECTION + ordering + delivery**, not the reminder's internals.
`domain/rpg/substrate/reminder.ts` stays whole and rpg-owned — its header declares it "THE ONE HOME
OF THE STATE-LINE GRAMMAR," its exported line builders feed the macro/CEL surface
(`chat-ops/macro-view.ts`), and a reachability suite pins that coupling; relocating or splitting
those exports is a coupled-site minefield for zero capability. Instead:

- A `TeachingContribution` is `{ id, order, collect(tctx) → ChatInjection[] }`, registered at
  compose. **The wiring, stated precisely** (the gather is turn-local — a compose-time closure
  cannot reach it, so the per-turn inputs arrive via `tctx`): the collection call sits in chat's
  `buildTurnContext`, AFTER the existing `ctx.rpg.gatherTurnContext(...)` call, and `tctx` carries
  `{ chatId, the turn's resolved knob reads, rpgGather: ChatRpgGatherResult | null }`.
  **Contributor #0 (rpg) is a pure projection** — `tctx.rpgGather?.injections ?? []` — zero
  re-compute, content and order byte-unchanged. **S2 generalizes the INJECTIONS slice only:** the
  gather's other outputs (`macros`, `tools`, `terminalTools`, `cardKeepLastX`, `celBindings`) stay
  on the existing `ctx.rpg` path untouched. Non-game contributions (the offer-choices teach, future
  rule/plugin teach lines) are separate contributors with their own `order`, reading their knobs
  off `tctx`.
- The seam's output rides the EXISTING merge point in `verbs/turn.ts` (today `rpg?.injections`;
  that merge becomes the assembled collection). Delivery stays ephemeral gather candidates on
  the ONE ChatInjection channel — never persisted rows (the convergence law).
- **Teach TEXT lives in `PROSE_SLOTS`** — the existing contracts-homed, preset-editable,
  baseline-pinned prose system (`RPG_CYOA_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text`,
  reminder.ts:126; the #578-era slots joined the baseline in 4a5bb8e86). A contribution references
  a slot id; S2 never mints a second prose-constant home. *(Rejected: new versioned constants per
  contribution — the exact two-homes drift the seam exists to prevent, and it would fork the
  preset-editable surface the owner already has.)*
- *Why extraction at THIS scope:* moving the assembler itself into core (or splitting the
  reminder into line-granular contributions) would touch the state-line grammar's pinned
  couplings for zero capability; a whole-block contributor projected from the existing gather
  makes the byte-identity pin trivially strong and the diff reviewably small. *(Rejected: leaving
  teaching rpg-local — the offer-choices toggle and rule/plugin teach lines need a home that
  isn't rpg; rejected: a new seam beside the injections merge — a second steering channel is the
  convergence law's named sin.)*
- **Tests alone (the two pins):** (a) an rpg chat's assembled prompt is byte-identical before and
  after the seam lands, per mode and per cyoa-knob state; (b) a non-game chat with zero
  contributions assembles byte-identical to today. Plus: a game chat with the game cyoa knob ON and
  the chat-level offer-choices knob ON receives EXACTLY ONE choices teach block (the double-teach
  guard). **Merge class:** ordinary; the landing commit is behavior-frozen by (a)+(b).

### 1.3 S3 — rule presets as data

A preset table of plain functional names — "auto-add lore entries", "periodic pacing nudge",
"auto-illustrate scene changes", "dice chips after a beat", "clock fires when full" — each mapping
to the built engine: `{ id, title, triggerType, predicate (CEL source, a constant), arms,
knobs (the small exposed set), confirmFirst? }`. `createRuleFromPreset(chatId, presetId, knobs)`
mints a rule through the EXISTING `createRule` validation (reserved-trigger/arm refusals, CEL
parse, arm caps — never bypassed). Rules are chat-scoped (`automation_rules.chatId`,
db/schema/automation.ts:74; the `(chatId, enabled, triggerType)` index at :109), so a preset is
enabled per room.

- *Why data-not-UI first:* the engine (A1–A7 + transport) is proven; a preset is a row existing
  validation already gates; the UI graft (G2) then renders data instead of encoding product.
  *(Rejected: shipping the raw rule editor first — the recorded "boring admin console" failure the
  A8 chunk was headed for. Rejected: a `presetId` provenance column on `automation_rules` — schema
  cost + a merge window for a label; provenance buys re-sync semantics nobody asked for; the minted
  rule carries the preset's title and detaches on edit.)*
- **Test alone:** create-from-preset via tRPC → the rule fires end-to-end on a real chat event →
  the fire log records it; budget defaults ride the existing `automation_budgets` seeds.
  **Merge class:** ordinary (presets are code-shipped data).

## §2 Promotions and exported contracts (the rpg-lite consistency pass)

| What | Disposition |
| - | - |
| reminder assembler | rpg's reminder stays whole; the COLLECTION/ordering/delivery seam is promoted (S2); rpg = contributor #0, byte-identity pinned twice (§1.2) |
| `:::choices` fence render | STAYS in the content pipeline (canon plane, D110-1 fence registry) — untouched |
| choice click semantics | PROMOTED to S1's behavior contract (the ChoiceSend context is the seed); the fence block and any Scene-tab echo consume it; chips and cards match its visual language |
| teach-text prose | STAYS in `PROSE_SLOTS` — S2 references slot ids; no second prose home |
| lie/truth (deception) system | STAYS rpg-owned (one consumer; generalizing now is the fourteen-engines sin). TWO exports only: its teaching lines ride S2 as rpg-owned contributions, and its **visibility contract** is written as a short consumable section — the one-home verdict `viewerReadsHidden` (D110 §3.6: model-always · host via the server-gated eye · members server-STRIPPED, never client-hidden) that any future read surface (chronicle view, export, search) MUST consume, never re-derive. The D110 enforcement suite (every body/delta-serving surface + the mid-stream scrubber) is the existing enforcer; the contract section adds the consumer-facing statement, not new machinery. Generalizes the day a second feature wants hidden-vs-surface state |

## §3 Suggest/confirm — the #14 recreation without agents

The three-posture law of `agent-tool-propose-spec.md` §0 SURVIVES verbatim; its subjects change
from purged agent seats to the live actors:

1. **Standing authority ⇒ act directly** — a host-authored rule within its arms and budgets; a
   plugin within its grants.
2. **No standing authority ⇒ suggest + confirm** — a rule whose action is marked confirm-first
   (preset flag or per-rule knob), or whose spend arm exceeds its budget ceiling, emits a
   SUGGESTION instead of executing (or instead of a silent `budget_refused`): a confirm card in the
   S1 seam ("add this lore entry?", "illustrate this scene?") the HOST clicks; the confirmed action
   runs through the SAME front-door op it always would, under the CONFIRMER's Principal — the
   host's own spend, the host's own authority, every gate re-run fresh.
3. **Structured-output-only ⇒ no tools** — unchanged (D109-4's `structured` role).

**The fourth-posture redline survives too:** direct execution without a standing authority object
must never exist — it is the `buildChatToolOps` host-Principal hole with a friendly name (#14 §0).

**Mechanics** (the half the primary's draft leaves unstated — §6 delta 5):

- **Storage: an in-RAM pending map** in the automation engine, keyed `(chatId, ruleId)` with
  replace-per-kind (a rule's newer suggestion supersedes its older one) and a TTL (lean: 1 h).
  *Why in-RAM, not a table:* the #14 spec's own precedent split — buddy's owner-present in-RAM
  5-min TTL vs the 72 h durable rows for away-host agent proposals. A rule's suggestion is
  moment-scoped ("illustrate THIS scene") — durable rows would resurrect stale suggestions into a
  moved-on story. Two honesty riders on this choice: **(a)** in-RAM state dies on every server
  respawn (`node --watch` respawns on any watched-src merge — the standing lane fact), which is
  ACCEPTED for moment-scoped suggestions (the rule re-fires on the next matching event) and is one
  more reason durable rows are the away-host upgrade, not the default; **(b)** the AUDIT story in
  the default arm is the bus + the pending map ONLY — `AUTOMATION_FIRE_OUTCOMES` has NO
  suggestion-shaped terminal today (contracts/automation/index.ts:65-74), and adding one edits the
  tuple-built CHECK on `automation_fires.outcome` = a generated-baseline edit = a **merge-window**
  change under #533/#534. v1 therefore writes NO fire row at suggestion time; the CONFIRMED
  execution records through the arm path's existing outcomes. If the owner wants suggestion
  terminals in the fire log, that is a named, separately-scheduled baseline change — priced into
  fork F1, never smuggled in as "ordinary."
- **Surface:** a bus event (the live automation channel) + the S1 confirm card, host-visible only
  (the #14 §4 host-elision precedent: undecided host-authority actions are noise to members).
- **Confirm:** `confirmSuggestion` (host-gated) re-validates the arm against the CURRENT rule
  state (rule still enabled, arm still valid) and executes through the SAME arm-dispatch path the
  engine uses (`runArm`/`createArmExecutors` — whose dispatch is a switch, deliberately not a
  Record, per its own header; the NEW compile enforcer here is a separate exhaustive Record over
  SUGGESTIBLE arms → summary renderers) — the confirmed run bills and gates as the confirmer, not
  the rule's autonomous budget lane. `dismissSuggestion` drops the pending entry. Spam is
  structurally bounded: one pending per `(chatId, ruleId)` + the engine's existing fire budgets.
  Build-brief obligation (stickler round 2): fire-log recording lives in the engine's dispatch,
  not in `runArm` — the confirm verb writes its own fire row (the existing `fired` outcome
  supports it) so the confirmed execution is auditable without new vocabulary.
- **Plugins join later, not v1:** a plugin-initiated suggestion is new membrane-adjacent host
  surface; it lands with the plugin client AFTER the D46 security review (#24's wake). *(Rejected:
  reviving any agent-principal machinery — dead/parked per the standing rulings; #13/#14 stay
  parked and this section supersedes #14's build plan while preserving its law.)*

## §4 The graft ladder

Grafts are grouped by dependency class (delta 4, presentational: the primary's ladder already has
zero forward dependencies; an explicit independent-of-the-core class makes it visible at a glance
that two grafts can land before or beside S1–S3).
Every db-baseline row schedules as a merge window under the #533/#534 rule: the baseline edit drops
the dev db at the next respawn — pin the pre-migrate backup (`touch …backup-<stamp>.keep`) the
moment it appears.

| # | Graft (plain name) | Rides | The owner's hands-on test | Merge class | Knob |
| - | - | - | - | - | - |
| **Independent — land any time, before or beside the core** | | | | | |
| G-I1 | imagery client (#22 I5) | the 3 built-but-unwired imagery procs (editImage / extractPrompt / readProvenance) + existing verbs | /imagine, preview→edit, set-as-background, read provenance | ordinary | none new |
| G-I2 | message reactions, message-level (#23 MR0–MR2) | its own `message_reactions` plane + the `message-footer` anchor — NOT S1 (§6 delta 3) | react to a message; second tab sees it live | **merge-window** (db baseline) | none new |
| G-I3 | reactions: segments + prompt-attribution + character reactions (MR3–MR5) | the kit speaker-span parser (`parseSpeakerSpans`, `packages/kit/src/speaker-label/index.ts:64` — already isomorphic and multi-consumer) + the assembly gather + a `react` tool in the ONE registry. **Build-time verification item, scoped honestly:** whether `parseSpeakerSpans` serves segment ANCHORING as-is (stable grouped indices + `segmentSpeaker` staleness semantics per the mini-spec) or needs a thin grouping layer on top is MR3's first task — the mini-spec's `@orb/kit/speaker-segments` port target is that layer's name if it's needed, and it derives from the ONE parser either way (never a second recognizer) | react to one speaker's line; next turn the model acknowledges it; a character reacts back | ordinary | attribution caps (K≈8 + content cap), owner-tunable per the #23 ruling G |
| **Core consumers — each proves one seam** | | | | | |
| G1 | offer-choices toggle (per-chat) | S2 | any chat: model offers `:::choices`, click lands in the composer (the fence already renders clickable everywhere; this graft adds the TEACHING) | ordinary | `offerChoices` on chat metadata (healed sub-blob), wired both ends at birth (D107 knob-wire-coverage); fork F2 on the home |
| G2 | rules list + preset picker | S3 | enable "auto-illustrate", watch it fire; budgets invisible until a cap hits | ordinary | per-preset exposed knobs only |
| G3 | quick-reply chips | S1 | a rule surfaces chips; click sends as the clicking member (or composes — the S1 axis) | ordinary | per-rule chip arm settings |
| G4 | confirm cards | S1 + S4 (+ S3 confirmFirst flags) | a confirm-first preset suggests; host click executes; dismiss drops it | ordinary under F1's default (no fire-row at suggest time); flips to **merge-window** if the owner wants suggestion terminals in the fire log (the `AUTOMATION_FIRE_OUTCOMES` CHECK edit — §3) | `confirmFirst` per preset/rule; `suggestOnRefusal` (fork F4) |
| G7 | checks chip (game-mode arm) | S1 + the dice tool | "Roll Persuasion DC 12" chip → server roll → the narration reacts | ordinary | game config |
| G8 | clocks | SegmentedClock + an S3 preset (fires-when-full) | a clock fills; the preset's action fires | ordinary | the preset's knobs |
| G9 | saved casts (#26, re-derived) | `rosterMemberSpecSchema`/`characterMemberSpecSchema` + `seatKnobsSchema` (contracts/chat/roster.ts:76–99 — the shapes are pre-cut for exactly this; D80's projection comment names roster presets) + D80 `setSeatKnobs` at apply | save a room's cast; one click into a new chat | **merge-window** (schema: preset + members tables) | per-member seat knobs ride the saved rows |
| **Gated — wake conditions, not sequence positions** | | | | | |
| G10+ | maps · chronicle read-view · hub-as-plugin · snippet runner | per item | maps after G7/G8 prove the appetite; chronicle only CONSUMES the §2 visibility contract; hub + snippets AFTER the D46 membrane security review (#24) | per item | — |

Sequencing within the core-consumer class is fun-per-effort with zero forward dependencies; any
prefix of {independent} ∪ {G1..G9} is a coherent product. After S1–S3 alone, nothing user-visible
changed (byte-identity everywhere) — the substrate is provable but silent, exactly the carve
method's intent.

## §5 Finish-lines for the standing programs (recreated to fit, not resumed as specced)

- **tool-use** — DONE to its consumer frontier (T1–T4+T7 live; T6's helper superseded by
  `runStructuredTurn`; T5's verb reserved; the old consumers dead). This program adds CONSUMERS,
  not chunks: the dice/check tools (G7), the `react` tool (G-I3), and every S4-confirmed action run
  through the ONE registry and the one execute path. The recorded tool-picker criterion stays the
  flip trigger for `ToolDefinition` promotion. No new proposal slice lands in tool-use v1 — S4's
  in-RAM map lives with the engine that emits it (automation); the #14 durable slice is the
  recorded upgrade shape if fork F1 ever flips.
- **automation** — the engine is done (A1–A7 + transport). **A8 is REPLACED by S3+G2+G4** of this
  plan: presets as data, a plain rules list, confirm cards, one autonomy surface shown only on
  refusal. #592 re-gates to this plan; the admin-console shape is retired. The client mount
  (delta 6): NO `features/automation` mirror — rules are chat-scoped, so the rules list + preset
  picker land in the chat feature's room-settings surface; anything genuinely global rides a
  settings-section contribution (the SET-SEAMS pattern: a section in the owning feature + one door
  line).
- **plugin** — the membrane is done (P1–P4+P6, the 24-block escape suite). Its client half obeys
  ONE rule: **plugins have zero private surfaces** — plugin tools are registry tools, plugin
  transforms ride the D50 seam, plugin chips/cards ride S1, plugin teach lines ride S2. The
  manager UI (install/grant/enable/log) and the snippet runner land AFTER the D46 security review
  (#24's wake), small, and any security-adjacent slice routes to the security lane, never a
  general one.
- **#14 (agent tool proposal)** — folded into §3: the three-posture law and the fourth-posture
  redline survive; the agent-seat subjects do not. The spec stays parked as the historical
  argument; #13 stays parked on the owner's explicit want and is not a prerequisite of anything
  here.

## §6 Explicit deltas vs the primary's draft (`docs/design/interaction-substrate-spec.md`)

Numbered; each carries its receipt. AGREE rows are stated so the convergence is auditable.

1. **REFINE — C2's extraction scope.** The primary moves the ASSEMBLY HOME into core ("the
   assembly home becomes core — built by extracting rpg-lite's reminder assembler"; rpg
   re-registers as contributor #1, content unchanged). This plan moves NO rpg code at all:
   `reminder.ts` stays whole and rpg-owned, and the promoted seam is only the per-chat
   collection/ordering/delivery, with contributor #0 a pure projection of the gather's already
   computed injections. Receipt for why the file must not move or split: its header declares it
   the ONE home of the state-line grammar whose exported line builders feed
   `chat-ops/macro-view.ts` under a reachability suite — relocating the assembler touches that
   pinned coupling for zero capability. Same destination (one teaching home, rpg = first
   consumer, byte-pinned); strictly smaller diff.
2. **ADD — teach-text home is `PROSE_SLOTS`.** The primary's C2 doesn't name where teach text
   lives; the tree already homes it as preset-editable, baseline-pinned data
   (reminder.ts:126; commit 4a5bb8e86). S2 contributions reference slot ids; minting new
   versioned constants would fork the prose surface.
3. **DISAGREE — reactions are not a C1/S1 consumer.** The primary lists reactions among C1's four
   consumers and G5 rides "C1 (pills)". Reaction pills are PERSISTENT CANON, not transient
   controls; neither half of the seam's behavior contract applies — reactions are explicitly not
   turns and take no turn lock (`message-reactions-mini-spec.md` §5: arbitration-safe without the
   lock, idempotent INSERT/DELETE), so disabled-while-turn-runs is wrong for them, and a toggle
   mutation is not send-vs-compose consumption. They anchor at `message-footer` with their own
   plane; only the visual language (a shared chip primitive) is common. Forcing them into S1
   widens the seam toward the god-surface it must not become.
4. **REFINE (presentational) — the ladder gets dependency classes.** The primary's §4 already
   states "zero forward dependencies" and its Rides column is accurate; what this plan changes is
   the GROUPING — G6 (imagery) and reactions MR0–MR2 are pulled into an explicit
   independent-of-the-core class so the owner sees at a glance they can land before or beside
   S1–S3. Receipts: the tree facts (imagery server-complete, 3 unwired procs; #23 zero unbuilt
   prerequisites).
5. **ADD — confirm-card mechanics.** The primary's §3 names the card and the authority rule but
   not storage, spam bounds, or lifecycle. This plan specifies: in-RAM pending map, replace-per-kind
   `(chatId, ruleId)`, TTL, respawn-loss accepted and stated, re-validation at confirm, execution
   as the confirmer through the engine's arm-dispatch path (`runArm`/`createArmExecutors`),
   host-only visibility, and the fire-log honesty rider (no suggestion terminal exists in
   `AUTOMATION_FIRE_OUTCOMES` today; adding one is a baseline merge window) — each with its
   #14-spec precedent (§3 above; propose-spec §3.5–3.6, §4). The durability choice is priced as
   fork F1 instead of left implicit.
6. **ADD — G2's client mount is named.** "Rules list + preset picker" must not mint a
   `features/automation` mirror (the pain doc §7 sin; no automation feature dir exists today —
   verified). Rules are chat-scoped (db/schema/automation.ts:74,109) ⇒ the surface lands in the
   chat feature's room-settings; global remainder rides a SET-SEAMS settings section.
7. **ADD — the enforcer column.** The primary's §1 names tests but not consistently the tier that
   goes RED per seam (constitution §2.3). §1's table names one per seam, including the honest
   "review-tier + one-mount chokepoint" answer for S1 where no structural gate exists.
8. **ADD — the double-teach guard.** G1's teach line and rpg's cyoa teach can coexist on one chat;
   the primary doesn't pin the interaction. S2's test set includes: game chat + game cyoa knob ON +
   chat-level offer-choices ON ⇒ exactly one choices teach block.
9. **EXTEND — suggestion-on-budget-refusal is posture 2.** The primary's §3 names "exceeds its
   ceiling" as a propose trigger; this plan makes the consequence concrete: a ceiling-refused spend
   arm MAY surface a suggestion (knob-gated, fork F4) — the host's confirmed execution is the
   host's own spend, so no budget is laundered. Receipt: the #14 posture table (standing authority
   vs per-action consent).
10. **DISAGREE (scope) — plugins are deferred from posture 2's v1.** The primary's §3 makes
    plugins v1 suggestion actors ("a rule or plugin whose action exceeds its ceiling … emits a
    SUGGESTION"). This plan ships v1 with RULES only: a plugin-initiated suggestion is new
    membrane-adjacent host surface, and every new plugin host surface is gated behind the D46
    security review (#24's wake) — the same gate the primary itself applies to the plugin manager
    UI and snippets. Plugins join posture 2 with their client half, post-review. The postures
    themselves are unchanged; only the v1 actor set narrows.
11. **AGREE** — the fence renderer stays in the content pipeline; deception stays rpg-owned with
    the two exports (teaching lines + the D110 §3.6 visibility contract); S3/C3 data-before-UI;
    the three-posture recreation without agents; crew dead / #13 parked / full-rpg superseded as a
    plan; hub + snippets gated on #24; G5/G9 flagged merge-window for the db baseline; the §7
    "what the owner can do at each stop" framing. On all of these the two drafts converge and the
    primary's text stands.

## §7 Remaining owner forks (cleanly posed; a default named for each)

- **F1 — confirm-card persistence.** In-RAM pending map with TTL + replace-per-kind (DEFAULT —
  moment-scoped suggestions, zero schema; audit = the live bus + the confirmed execution's
  existing fire-log outcomes ONLY — suggestion-time fire rows would need an
  `AUTOMATION_FIRE_OUTCOMES` member = a baseline merge window, §3; pending state dies on server
  respawn, accepted) vs durable rows (#14-shaped: survives respawns and away hosts, full audit
  trail; +1 table, +merge window, staleness semantics). Flip criterion recorded: wanted
  suggestions expiring unseen in host-absent rooms.
- **F2 — the offer-choices knob home.** Per-chat metadata sub-blob (DEFAULT — a room-mode toggle,
  matching rpg's per-game cyoa knob) vs preset-owned (generation-behavior reading; would make the
  toggle travel with the preset). Both are one healed field; the default keeps room behavior with
  the room.
- **F3 — reactions program shape.** Land as three owner-testable stops (MR0–MR2 message-level →
  MR3 segments → MR4 attribution → MR5 character reactions; DEFAULT — the carve discipline) vs one
  merged program (the literal 2026-07-18 "maximal" ruling). Read here as: maximal fixed the SCOPE
  (all of it is committed), the carve fixes the MERGE SHAPE (one piece at a time) — stated so the
  owner can veto that reading.
- **F4 — `suggestOnRefusal` default.** ON for spend arms (DEFAULT — turns silent `budget_refused`
  into a host decision) vs OFF (quieter rooms). Per-rule knob either way.
- **F5 — ladder order taste.** Whether the independent grafts (imagery, reactions) land before the
  core consumers. No dependency either way; pure fun-per-effort ordering.

## §8 Dead and parked, without euphemism

Crew: dead (D59 disposition note; owner 2026-07-30). Agent principals (#13): parked on the owner's
explicit want; nothing here depends on them, and they are not pitched as a next step. Full-rpg
R6–R11: superseded as a plan — future full-mode work is a graft spec over the lite spine
(rpg-design/13's BUILD-STATE RIDER; D109 governs the turn shape — tools:[] every mode, the state
round is a separate post-commit call). Hub browse (#21): gated on the adapter-home ruling + the
security review. Expressions (#20), world-state/clips/trackers (#29), spatial (#27/#595): unchanged
parks — the chronicle read-view (G10+) is the only touchpoint and CONSUMES the §2 visibility
contract and the #29 planes' own stores, never re-derives them. legacy-main: read-only reference,
cited per read; nothing ported.
