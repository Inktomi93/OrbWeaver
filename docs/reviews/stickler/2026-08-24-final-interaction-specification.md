---
kind: design
status: draft
updated: 2026-08-24
---

# THE INTERACTION DIRECTION — definitive specification and the path (claude-b, max-effort pass)

> **SUPERSEDES** `docs/history/reviews/stickler/2026-08-23-interaction-redesign-plan.md` and
> `docs/reviews/stickler/2026-08-23-interaction-systems-audit.md` (both untracked; left unedited —
> this header is the supersession record). Their stickler-verified content is folded in, corrected
> where the legacy dig refuted it. Iterated with the stickler role to convergence (round count in
> the final section). Owner rulings folded, all binding: the five commissioning rulings of the two
> prior passes PLUS the 2026-08-24 set — (1) the crew objection was DUPLICATION never capability
> (background AI is welcome on the ONE engine; banned is any second execution system, persona,
> seat, or parallel domain); (2) the director row of the prior disposal table OVERCLAIMED — a
> static guided-template nudge is not the director; this spec homes the analysis half honestly;
> (3) the INSIDE/OUTSIDE-the-room taxonomy is the spec's spine; (4) NO per-kind permission
> snowflakes — one kernel, personas are faces, characters are content; (5) forks F1–F5 stay
> owner-pending, carried with refined pricing; the free presets + the analysis arm fold in as
> owner-optional ladder rows.
>
> **Evidence bar:** every claim carries a `path:line` or `legacy-main:<path>` receipt; every seam
> names HOME + ENFORCER (honest "review-tier" where true); every cost is priced (merge class,
> coupled sites, new union members with belt sites); unknowns are stated WITH their resolving
> probe. Legacy files were read WHOLE via `git show legacy-main:<path>`; nothing is ported — legacy
> is the semantics truth for what the purged things actually did (the rpg-design/13 banner proved
> the docs lie about legacy state; the code does not).

## §1 The direction, and the taxonomy that is now the spine

**The direction.** Orbweaver's rooms become interactive stories: the model can offer choices, the
room can talk back (chips, cards, reactions), background intelligence maintains lore, pacing,
images and state — all WITHOUT new room actors, without a second execution system, and with every
piece landing alone, owner-testable, byte-identical when off.

**The taxonomy (owner-articulated, binding).** Background AI splits by its relationship to canon:

- **CLASS 1 — OUTSIDE the room.** Reacts, NEVER speaks. Side effects only: lore writes, state
  writes, suggestions, backgrounds, images, notifications, quiet analysis. Its path to PROSE canon
  is ASKING THE PIPELINE for a turn (`trigger_turn` → the guided request,
  `entry/compose/automation-plugin.ts:112-115`, into the one turn pipeline with the
  D19 triple stamped at `domain/chat/verbs/turn.ts:2496-2498`).
  **One precisely-bounded non-turn canon path exists and is the rider on this wall:** the
  `generate_image` arm's non-quiet default POSTS the generated image into the chat as a message —
  through chat's ONE existing image-post seam (`postNarratorMessage`), depth-stamped and
  `initiator:"automation"`-attributed (`domain/automation/contract/ops.ts:66-70`, `:51-56`). It is
  an ATTRIBUTED MEDIA post through a chat-owned chokepoint, never model prose. The wall as law:
  **no text/prose message-insert op exists on the arm surface, and none may be added** — the ops
  table exposes `chat.listBackgroundChoices`/`setChatBackground`, `worldInfo` upserts,
  notifications, imagery, and the turn REQUEST (`domain/automation/contract/ops.ts:114-183`).
  ENFORCER: the op-type contract (compile — an executor calling a nonexistent op doesn't
  typecheck) + review-tier redline on any ops-surface widening. The plugin membrane is the same
  wall for plugins (`PluginHostV1` — read/variables/quick-reply/requestTurn/worldInfo/storage,
  no message write; `contracts/plugin/host-v1.ts:81-119`).
- **CLASS 2 — INSIDE the room.** Contributes to canon, ALWAYS attributed. Two sub-modes:
  - **SEQUENTIAL** — takes a turn SLOT via arbitration (the chat lock, the one turn pipeline).
    Every message/variant carries author identity (`messages.authorUserId`/`characterId`; the
    D137 cast producer resolves every referenced identity through ONE kind-discriminated home).
    Any future in-room agent is class-2-sequential = a seat + attribution = **exactly parked
    \#13, nothing less** — this spec builds none of it and depends on none of it.
  - **CONCURRENT** — contributes alongside a turn WITHOUT a slot. The pattern exemplar is the
    D109 state round (a post-commit model call keyed to the committed variant — never a message);
    reactions are the human-and-character concurrent form (canon junction rows attributed to a
    participant seat, no turn, no lock — `message-reactions-mini-spec.md` §5). MR5 (a character
    reacts via a tool DURING a turn) is class-2-concurrent, **which is exactly why it needs the
    tool-attach seam** (§6 R2): concurrent contribution rides the turn's wire, and today no
    registry tool can attach to any chat turn (`turn.ts:627` `attachedToolNames: rpg?.tools ?? []`
    is the only source; rpg pins `tools: []` every mode — D109-1, `domain/rpg/chat-ops/gather.ts`).

**The class-1 quiet-analysis arm (§4) is class 1; every graft in the ladder (§7) is tagged with
its class.** Nothing in this spec creates a class-2-sequential actor.

## §2 The authority law (ruling 4, spec-level)

All authority is HUMAN authority in the one kernel. A feature may CITE an existing axis; it may
never invent one. The axes, with their one homes:

- `can()` — the permission kernel (D121; global-role × resource-role × capability).
- The D19 triple — `Principal.userId` (authenticated caller) · `triggeredBy` (the human
  responsible: spend/abort/attribution) · `runAsUserId` (the host whose creds fund)
  (`Core-Path-Registry.md:51`).
- D17 — hosted credentials owner-only; non-owner use needs explicit consent, fail-closed
  (`Core-Path-Registry.md:47`).
- Automation budgets + the cascade depth cap (`automation_budgets`, the `automationDepth` fact).
- Plugin grants — the manifest capability vocabulary MAPPING DOWN onto `can()`/`fetchOwned`/D17
  (`plugin-design/02`); grants are not a parallel kernel, they are a projection onto it.
- The tool `capability` ceiling + the owning verb's own gates (`domain/tool-use`).

**Vocabulary split, enforced at review:** *permission* = human-side (may this person cause this);
*capability* = wire-side (can this model/connection do this — `ModelCapability.tools`,
`output.structured`). Conflating them is a review-tier defect. **Personas are FACES** — zero
permission surface, ever (a persona is a human's `{{user}}` presentation; authority always
resolves to the human). **Characters are CONTENT** — authority is held OVER them (ownership,
roster host-ownership — `chat/verbs/roster.ts:521-527` "A roster character is always host-owned"),
never OF them. The complete per-action authority table survives from the systems audit unchanged
except where noted, and is restated in §7.4 as the path's acceptance matrix.

## §3 The substrate — S1–S4, final form

(Condensed from the superseded plan where the stickler already converged; deltas from the legacy
dig are marked **LEGACY-INFORMED**.)

### S1 — the in-chat control seam (client)

ONE registry + behavior contract for TRANSIENT interactive controls near the transcript/composer.
Generalizes the click/consume contract `choice-send-provider.tsx` already spells (own
`useSendMessage`, busy from shared turn phase, compose default in non-game chats — file header).

- HOME: control-kind union + descriptors at the chat feature's composition tier
  (`packages/client/src/features/chat/`, the D70 registry tier); wire payloads in
  `@orb/contracts/automation`. ENFORCER: compile (`CONTROL_KINDS` + exhaustive
  `Record<ControlKind, ControlDescriptor>`); structure: the anchor mount renders registry output
  ONLY (a bolt-on has no anchor without touching the one mount — a one-file review chokepoint);
  CT mount matrix per kind. Honest tier: no gate forces future controls into the registry —
  review-tier, stated.
- Consumption axis `"send" | "compose" | "execute"`, busy semantics PER MODE: send =
  turn-phase-disabled with reason on title; compose = never disabled; execute = disabled only
  while its own mutation is pending (a confirmed action is a front-door verb call, not a turn).
- The `:::choices` fence renderer STAYS in the content pipeline (canon plane, D110-1
  `DIRECTIVE_FENCE_NAMES`); reaction pills are NOT S1 (persistent canon at `message-footer`;
  no turn lock, toggle ≠ send/compose — the converged delta 3 of the superseded plan).
- **LEGACY-INFORMED (design mine, not port):** legacy's chip system split CANON PROVENANCE chips
  (rendered from persisted `ToolCallRecord`s on the variant, with a per-message "N state changes"
  folded aggregate for bookkeeping — `legacy-main:packages/client/src/features/rpg/components/
  chips/folded-chips.tsx`, `check-dice-chips.tsx` rendering roll math from the PERSISTED result)
  from transient controls. S1 adopts the split as law: **the ASK is transient (S1); the RESULT is
  canon** (a `ToolCallRecord` chip, `message_variants.toolCalls` — already "the client's ONLY
  read surface for tool chips", `tool-use-design/README`). G7's check chip is the ask; the roll
  result renders as canon provenance.
- Test alone: CT matrix + one live drive off a hand-fired `quickReplySurfaced` (the live member —
  `contracts/automation/index.ts:341-348`). Merge class: ordinary.

### S2 — the model-teaching seam (server)

ONE per-chat assembly of "what this chat's model is told it can do," collected from registered
contributions, delivered on the existing injections merge. rpg is contributor #0, byte-unchanged.

- WIRING — **the final contract, stated ONCE (frozen at A1; R2 is part of it, not a later
  re-type):** the collection call sits in chat's `buildTurnContext` AFTER
  `ctx.rpg.gatherTurnContext(...)` (`turn.ts:561-577`); a `TeachingContribution` is
  `{ id, order, collect(tctx) → Promise<{ injections: ChatInjection[], toolNames: readonly
  string[] }> }` registered at `entry/compose`. ASYNC because real contributions read (the §4.3
  guidance contribution reads a stored variable); contributor #0 stays a trivially-resolved pure
  projection of `tctx.rpgGather?.injections ?? []` with `toolNames: []`. `tctx` carries
  `{ chatId, runAsUserId (the resolved host — sitting at the collection site already,
  turn.ts:600), resolved knob reads, rpgGather: ChatRpgGatherResult | null }`. The gather's
  non-injection outputs (`macros`/`tools`/`terminalTools`/`cardKeepLastX`/`celBindings` —
  `domain/chat/contract/context.ts:526-547`) stay on `ctx.rpg` untouched.
- **The `toolNames` axis (revamp R2, INSIDE this contract):** teach and ATTACH travel together
  (the rpg gather's own shape, generalized). `attachedToolNames` becomes the union of
  contributions' `toolNames` (today: always `[]` — byte-identical; MR5's react tool is the first
  non-empty contributor at B7). This closes the tool-attach gap inside the seam instead of
  bolting a second axis on later. The existing capability honesty gates it per turn
  (`tools_unsupported` drop, `engine/pipeline.ts:676,685-687`).
- Teach TEXT stays in `PROSE_SLOTS` (`RPG_CYOA_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text`,
  `domain/rpg/substrate/reminder.ts:126`; preset-editable, baseline-pinned — 4a5bb8e86). NO second
  prose home. `reminder.ts` itself never moves (its header: THE ONE HOME of the state-line
  grammar, macro-view coupled, reachability-pinned).
- HOME: contribution type in `domain/chat/contract/` (the `ChatRpgOps` sideways-type precedent);
  per-domain modules `domain/<x>/teaching-contribution.ts` (the D117 slot pattern); registry
  assembled at compose. ENFORCER: TWO byte-identity pins (rpg chat identical pre/post per mode ×
  cyoa state; zero-contribution chat identical to today) + the exactly-one-teach double-teach
  guard + the convergence law (all prose steering on the ONE ChatInjection channel,
  `lite-plus-guided-substrate-spec.md` §3.3; PD-63's one-placement ruling,
  `docs/architecture/history/Core-Debt-Cleared-Ledger.md`) + a dep-cruiser stanza (contribution
  modules importable only by `entry/compose`) — lint + review, honestly NOT package physics
  (intra-package imports resolve).
- Merge class: ordinary; the landing commit is behavior-frozen by the pins.

### S3 — rule presets as data (server)

Plain-named presets over the BUILT engine (A1–A7 + transport). **A preset mints an ordered RULE
SET, not exactly one rule** (stickler round 1: a rule's predicate gates the WHOLE rule before any
arm — `dispatch.ts` runs gates → predicate → arms — and no arm carries a per-arm condition
(`contracts/automation/index.ts:189-247`), so any counter-then-threshold shape needs TWO rules;
one increments unconditionally, the sibling fires at the threshold, same-batch ordering safe via
the env write-through, `arm-executors.ts:90-95`): `RulePresetDef = { id, title,
rules: readonly { triggerType, predicate (CEL constant), arms }[], knobs, confirmFirst? }`.
Most presets carry one rule; the clock carries two. `createRuleFromPreset` mints each rule
through the EXISTING `createRule` validation (never bypassed; `verbs/create-rule.ts` is
`requireChatHost`-gated), titled `<preset title> (i/n)` for n>1. Rules are chat-scoped
(`db/schema/automation.ts:74,109`). Knobs SUBSTITUTE AT MINT into the CEL sources as literals
(rejected: the `choice` env plane — a second config coupling; rejected: raw predicate fragments
as knobs — the admin-console failure smaller). Pure turn-cadence presets need NO counter at all:
`chat.messageCount` is already an env binding (`contracts/automation/index.ts:315`), so "every N
beats" is the single predicate `chat.messageCount % N == 0`.

- The preset table (v1 committed + owner-OPTIONAL rows marked ⭘; every row maps to EXISTING arms —
  receipts `contracts/automation/index.ts:160-247`):

| Preset (plain name) | Trigger → arms | Knobs | Status |
| - | - | - | - |
| auto-add lore entries | messageCommitted → `insert_world_info_entry` | book, key style | v1 |
| periodic pacing nudge | turnCompleted + counter predicate → `trigger_turn` (guided) | every-N-beats, the nudge text | v1 |
| auto-illustrate scene changes | worldInfoActivated or predicate → `generate_image` | mode, cadence floor | v1 |
| dice chips after a beat | turnCompleted + predicate → `surface_quick_reply` | chip labels | v1 |
| clock fires when full | TWO rules (the multi-rule preset shape): rule 1 = trigger → `set_variable inc` on `vars.X`; rule 2 = same trigger, predicate `int(vars.X) >= N` → the fired arm + a `set_variable set` reset | N, the fired arm | v1 (G8's state home — chat variables, stickler-confirmed swipe-correct: they fold along the selected lineage, `domain/chat/substrate/runtime-variables.ts:1-6`) |
| ⭘ illustrate on lore reveal | worldInfoActivated → `generate_image` | entry filter | owner-optional |
| ⭘ react to lore activation | worldInfoActivated → `trigger_turn` | guided text | owner-optional |
| ⭘ auto-set scene background | predicate → `set_chat_background` (the autobg quiet-pick arm, :237-247) | instruction bias | owner-optional |
| ⭘ story pacing analysis | §4's analysis arm with the director brief | cadence, steer | owner-optional (F7 family) |
| ⭘ distill lore from play | §4's analysis arm routing to lore ops | span floor, book | owner-optional (F7 family) |
| ⭘ prose audit | §4's analysis arm routing to a rewrite suggestion card | every-turn vs on-demand | owner-optional (F7 family) |

- HOME: `domain/automation/contract/presets.ts` + `verbs/create-rule-from-preset.ts`; id tuple in
  `@orb/contracts/automation`. ENFORCER: compile (exhaustive `Record<RulePresetId, RulePresetDef>`;
  arms typed against the action union — a retired arm fails tsc at every preset naming it); test:
  per-preset create→fire int test through the real engine. Merge class: ordinary. Free lever
  (corrected semantics): arm templates are macro-rendered at FIRE time in the AUTHOR's env
  (`arm-executors.ts:131-143`) — state-reactive chip text samples surface-time state, and `global`
  is the author's namespace.

### S4 — suggest/confirm (server + S1 card)

The #14 three-posture law over rules (plugins join post-#24): standing authority ⇒ act directly;
no standing authority (confirm-first flag, or a RATE-REFUSED spend arm — `budget_refused`,
knob-gated by F4; automation has NO $/day spend ceiling, it was deliberately stripped — the
budgets table is "the per-chat FIRE-RATE ceiling", `db/schema/automation.ts:127`,
`contract/ops.ts:73-75,95-97`) ⇒ a SUGGESTION the HOST confirms; structured-output-only ⇒ no
tools (D109-4). The fourth-posture redline: direct execution without standing authority never
exists.

- Storage: in-RAM pending map keyed `(chatId, ruleId)`, replace-per-kind, TTL. **LEGACY-INFORMED —
  this is now a proven precedent, not a lean:** buddy's propose/confirm gate was EXACTLY this shape
  (`legacy-main:packages/server/src/domain/buddy/agency/proposals.ts` — module-scope map, 5-min
  TTL, replace-on-new, ASSUMES(single-replica) locked note) with confirm as the only executor
  running claim → kill-switch → hourly budget → exhaustive kind switch
  (`legacy-main:.../buddy/verbs/confirm.ts`). S4's confirm re-runs: host-gate → rule still
  enabled → arm re-validation → execute through the engine's arm dispatch (`runArm`/
  `createArmExecutors` — a deliberate switch per its header) under the CONFIRMER's Principal;
  the confirm verb writes its own fire row (`fired` outcome — recording lives in dispatch, not
  `runArm`). Respawn wipes pending state — accepted for moment-scoped suggestions (fork F1 prices
  the durable alternative; the legacy 72h-durable arm was the away-host AGENT shape, #14 §3.5).
- Fire-log honesty rider (converged): `AUTOMATION_FIRE_OUTCOMES` (:65-74) has NO suggestion
  terminal; adding one edits the tuple-built CHECK on `automation_fires.outcome` = a generated-
  baseline **merge-window** change (#533/#534). v1 writes no fire row at suggest time.
- **Priced bus cost (converged):** one NEW `AutomationBusEvent` member (the union :341-348 has no
  member that can carry a host-only card) + its belt entry + bus-coverage sites + a HOST-tier
  filter arm at `transport/trpc/stream/sources/automation.ts`. Ordinary merge class (contracts
  vocabulary, not the db CHECK tuple).
- HOME: `domain/automation` suggestion slice; payload wire in `@orb/contracts/automation`; card
  renders through S1 (`execute` mode). ENFORCER: compile (a NEW exhaustive Record over SUGGESTIBLE
  arms → summary renderers); the authority matrix test (non-host refused; disabled rule voids
  pending; gates re-run under the confirmer).

## §4 S5 — the QUIET-ANALYSIS ARM (class 1; the honest director carrier)

**What the legacy director ACTUALLY computed** (read whole; the prior disposal table's "carried by
a guided-template nudge" claim is hereby retracted as an overclaim):

- Durable per-chat plot state: `arc` + `twists[]` + `retiredTwists[]` + `guidance` + a pass
  watermark (`PlotRow`, `legacy-main:packages/server/src/domain/crew/contract/director.ts`).
- A THINK-FIRST structured pass per cadence tick: inputs = recent transcript + current plot + the
  host's standing steer; output = twist-bank ops (add/retire; retire-before-add; `TWIST_CAP`;
  dedup), arc lifecycle (`arcStatus: active|completed`, `successorArc`/`updatedArc`/carry-forward),
  and ONE narrator-facing `guidance` instruction — "plant, foreshadow, or complicate"; **steers
  the NARRATOR's choices, never the players'** (the D82-playtest-validated rule, verbatim in
  `legacy-main:.../crew/members/director.ts` system prompt); "optional pacing scaffolding … soft
  ongoing tensions instead of a rushing plotline" (the anti-railroading line).
- Cadence: an atomic per-chat TURN counter bumped every assistant turn, pass enqueued at the
  configured cadence, counter reset ONLY on a real enqueue (a lock conflict leaves it durable —
  `legacy-main:.../crew/verbs/on-turn-completed.ts`), with a near-zero fast path for chats with
  nothing armed.
- Delivery: `guidance` became ONE ephemeral `in_chat` system injection at the authors-note depth,
  budgeted normally, byte-identical-null when off (`legacy-main:.../crew/verbs/
  gather-turn-context.ts` — depth `AUTHORS_NOTE_DEFAULT_DEPTH`, `audience:"host"`).

**The honest carrier on the ONE engine — a new action arm, plain name `run_analysis`:**

1. **The arm** (`AUTOMATION_ACTION_TYPES` + schema arm + executor): rule fires → a QUIET
   schema-constrained model pass over `{ the recent selected-lineage window, the arm's stored
   STATE, the host's steer knob }` → the model returns `{ stateOps, guidance, suggestions[] }` →
   the executor routes each output class. The model lane is the `structured` role (D109-4 — the
   constrained-generation primitive; its dispatcher `infra/providers/roles/structured.ts`; the
   metered sub excluded by its firewall row), via `runStructuredTurn`
   (`packages/server/src/kit/structured-turn`) — the exact machinery the #29 reconciler spec
   names and refinery/discovery consume today. SPEND-classed: rides the existing budget stack +
   depth guard like `trigger_turn`.
2. **State home: the rule AUTHOR's global variables**, namespaced per chat (e.g.
   `orb.analysis.<chatId>.<stateKey>`, a JSON value). WHY: (a) host-only BY CONSTRUCTION — the
   `global` plane is per-user, `fetchOwned`-scoped; a member's `{{getglobalvar}}` reads their OWN
   namespace, so the twist bank cannot leak through a member macro — today a fortiori: the ONLY populator of the macro env's `globalVars` is automation's own render (`substrate/macro-render.ts:30`, the author's env); no chat-side code stages the global plane at all, so a member's `{{getglobalvar}}` on a chat turn resolves `""` (missing-key semantics, `kit/src/macro/registry.ts:425`) — C1's builder should not hunt for chat-side global staging (the leak a chat-scope variable WOULD have: any member sends `{{getvar::plot}}` and the model renders it); (b) NOT swipe-folded
   — matching legacy `crew_plots` semantics (plot state was room-progress-keyed, never
   variant-keyed; the A3 pinned semantics "swipe does NOT rewind a global" is the same posture);
   (c) zero schema — `global_variables.value` is TEXT with a 64 KiB CHECK and its schema header blesses JSON-in-a-string for structure plus the no-swipe-rewind posture (`db/schema/automation.ts:183-186,204`; cap constant `contracts/automation/index.ts:90`). The executor writes through the existing global-variable persistence the
   `set_variable` arm already uses (`arm-executors.ts:97` `upsertGlobalVariable(ownerId:
   frame.authorUserId, …)`). *(Rejected: a new `automation_notes` table — schema + merge window
   for state one map already holds; rejected: chat-scope vars — the member-macro leak above;
   rejected: `chats.metadata` — host-SET config, never machine output, the #29 spec's own
   rejection of metadata-as-derived-store.)*
3. **Guidance delivery: an S2 teaching contribution registered by automation** — reads the stored
   guidance for `(author=current host, chatId)` and emits ONE ephemeral `in_chat` system injection
   at the authors-note depth (the legacy register; retro's `ChatInjection` carries
   `position:"in_chat"` + `depth` — `contracts/chat/assemble.ts:84-100,119`). Ephemeral means no
   member-inspectable row exists (the injections editor shows persisted rows only); the model
   always sees it — same posture as legacy's `audience:"host"` without needing the field (retro
   has no `audience`; adding one is fork F6's durable arm). Byte-identity: no stored guidance ⇒ the contribution returns `[]` ⇒ untouched assembly. **Host-handoff consequence, stated:** state writes key the AUTHOR's namespace, fires gate on `holdsAuthority` (author must still hold host, `dispatch.ts:116-127`), and this read keys the CURRENT host — so on handoff the rule stops firing AND the guidance read hits the new host's empty namespace ⇒ `[]` ⇒ byte-identical assembly. Fail-safe in both directions; the ex-host's orphaned state ages harmlessly in their own namespace.
4. **Suggestions route through S4** (confirm cards) and DIRECT writes route through the arm's
   CLOSED output-op union — v1 members: `setState` (the global-var write) · `steer` (the guidance
   slot) · `upsertLoreEntry` (the existing `worldInfo.upsertEntries` op the
   `insert_world_info_entry` arm already rides; span-stamped idempotent titles and the
   merge-at-cap discipline adopted from the keeper —
   `legacy-main:.../crew/members/lorebook-keeper.ts` `stampKeeperEntryName`) · `suggest` (an S4
   card). Per-output-class `apply: "direct" | "confirm"` is preset-set — posture 1 vs posture 2
   made data. ENFORCER: the closed union + an exhaustive Record (output class → applier); a new
   class fails tsc.
5. **The fence against #29:** the reconciler (`world-state-clips-trackers-spec.md` §3) is derived
   TRUTH — a watermarked, rebuild-on-hash-mismatch pure function of canon, memory-owned, whose
   rows are destroyable and re-derivable. The analysis arm is authored DIRECTION — forward-looking
   steering state that is NOT a function of canon (the same transcript admits many arcs) and is
   NEVER rebuilt from it. They share no store, no vocabulary, no workload. When #29 wakes, its
   reconciler must not absorb this arm, and this arm must never grow tracker/clip synthesis —
   the boundary test: "could a rebuild from canon reproduce it?" yes ⇒ #29's; no ⇒ this arm's.
6. **What is deliberately NOT rebuilt:** the crew domain, the workload scheduler, `crew_plots`,
   the `audience` field, any member identity. One engine, one watcher, one budget stack —
   ruling 1's exact demand. Cadence = the single predicate `chat.messageCount % N == 0`
   (`chat.messageCount` is an env binding, `contracts/automation/index.ts:315` — no counter
   variable, no second rule) plus `event.turn.automationDepth == 0` guards — the legacy
   turn-counter's semantics without a scheduler and without state.

- **Costs, priced:** contracts — 1 new `AUTOMATION_ACTION_TYPES` member + schema arm (+ its
  arm-cap interplay: none; ordinary member) + the output-op union; engine — the executor + dry-run
  preview arm (`substrate/dry-run.ts` renders arm previews — the new arm needs its preview) +
  spend classification; S2 — the automation teaching contribution; client — the D83 copy rows for
  refusals + the fire-log row rendering. NO schema, NO new bus member (fires ride existing
  outcomes; suggestions ride S4's member). Merge class: **ordinary**. Test floor: golden pass
  (fixture transcript + state → deterministic prompt build, the legacy member-module purity
  pattern); the merge semantics (retire-before-add, cap, dedup — property tests); route matrix
  (direct vs confirm per class); the byte-identity pin (arm absent ⇒ assembly untouched);
  authority (the arm runs as the author; `holdsAuthority` per fire, `dispatch.ts:115-128`).
- **Prompt content:** authored FRESH against the legacy semantics (the statProfile precedent —
  fresh authorship from published/verified semantics, no string ports). The legacy briefs' proven
  lines to preserve AS SEMANTICS: narrator-not-players; optional-scaffolding/soft-tensions;
  retire-on-payoff; empty-is-the-common-case (card/keeper); when-in-doubt-clean (audit).

## §5 The purged-capability disposition table (REWRITTEN — the honest version)

| Purged concept | Its capability | Carried NOW by | Status |
| - | - | - | - |
| crew lorebook-keeper | distill durable keyed lore from settled play (span-stamped, idempotent, merge-at-cap, never secrets unrevealed on-screen — `legacy-main:.../members/lorebook-keeper.ts`) | template half: `insert_world_info_entry` (live arm); ANALYSIS half: the `run_analysis` arm's `upsertLoreEntry` route (⭘ "distill lore from play" preset) | carried when ⭘ lands; template half live |
| crew director — cadence half | fire every N beats | a rule predicate — §4.6's stateless `chat.messageCount % N` form (the counter-variable shape also exists via the clock preset) | carried (live engine) |
| crew director — ANALYSIS half | think-first pass: arc + twist bank + ONE narrator-only guidance (the prior table OVERCLAIMED this as carried; it was not) | the `run_analysis` arm + the ⭘ "story pacing analysis" preset + the S2 guidance contribution (§4) | **spec'd here; owner-optional** |
| crew prose-audit | post-turn quiet audit → clean/issues verdict + full conservative rewrite (`legacy-main:.../members/prose-audit.ts`) | the `run_analysis` arm routing a rewrite SUGGESTION through S4 (host confirm executes the host's own edit verb) — the prior table's "dead (turn-hold)" was wrong: legacy was strictly post-turn async already; the anti-pattern was blocking calls, which class 1 structurally cannot make | ⭘ owner-optional (F7) |
| crew card-evolution | earned-evolution card proposals, append-over-replace, empty-is-common | refinery `apply-fields`/`apply-as-copy` + pre-apply snapshot (owner workshop; `domain/refinery/contract/service.ts:2-5`) — the room/library line keeps it OUT of rules (rooms must not mutate cross-room library identity) | carried (manual) |
| crew persistent guides | labeled persisted steering injections, auto-refresh | NOT carried v1 — parked with a named doorway: a `run_analysis` output class writing a labeled `chat_injections` row via a chat op is the additive shape IF wanted; overlaps #29's trackers (steering prose vs derived state) — boundary decided when either wakes | parked |
| buddy observer/reactions | ambient per-user signal→quip/mood loop (`legacy-main:.../buddy/observer/react.ts` — cooldown, CAS, dedup, canned fallback) | nothing — dead scope (the companion, not the room direction); its ENGINEERING patterns (cooldown-class rate gates, never-throw-into-the-bus isolation) already live in the automation engine | dead |
| buddy propose/confirm | act-only-with-consent, in-RAM TTL, kill switch + hourly cap at confirm | S4 (the same shape, generalized; receipts §3-S4) | carried (recreated) |
| echo-chamber | ambient multi-voice chatter | dead (was buddy-subsumed; buddy is dead) | dead |
| agent principals (#13) | an AI with its OWN principal + ceiling (the containment suite proved the walls: sessions never mint an agent Principal; disable ⇒ nothing; cascade clean — `legacy-main:tests/server/domain/admin/containment.suite.int.test.ts` header) | parked WHOLE on the owner's explicit want; class-2-sequential is its slot when it wakes; the containment-suite design is the re-proof template then | parked |
| agent tool-propose (#14) | propose-flavored tools for a seated agent | superseded by S4; spec kept as the historical argument | superseded |
| crew structured-output rule | "an actor is not a proposer" | `runStructuredTurn` + the `structured` role (D109-4) | carried |
| GM seat | standing per-game authority object | dormant DDL (`rpg_games.gmUserId` nullable, `db/schema/rpg.ts:58-81`) — full-mode graft | dormant |

## §6 REVAMPS — existing code this direction changes (not adds)

| # | What changes | Why | Migration shape | Pinned by |
| - | - | - | - | - |
| R1 | `domain/chat/verbs/turn.ts` injections merge → the S2 collection (`buildTurnContext`, after the rpg gather) + `ChatContext` gains the teaching registry input (null = today) | one teaching home | additive op, null-op default (the `rpg` null-op precedent — `rpg: input.rpg ?? null`, `entry/compose/chat.ts:1235`) | the two S2 byte-identity pins |
| R2 | `turn.ts:627` `attachedToolNames` → union over S2 contributions' `toolNames` (rpg contributor keeps returning `[]`). **Lands WITH A1** — the contract freezes once; B7 is merely its first non-empty contributor | class-2-concurrent needs a sanctioned attach path; today none exists | additive; empty-union ⇒ byte-identical | an attach matrix test (no contributions ⇒ `[]`; MR5's contributor ⇒ exactly its names; capability-absent ⇒ dropped + `tools_unsupported`) |
| R3 | `composer-utility-menu.tsx:214-229` — "Offer choices" un-game-gated (renders in plain chats when the offer-choices knob context exists) | G1's one-shot sibling is game-only today; the standing/momentary pair should exist wherever the fence renders (it renders everywhere) | client-only; the game arm unchanged | CT: menu shows the item in a non-game chat; teach text = the same prose slot family |
| R4 | `contracts/automation/index.ts:214` comment "(rendered at click time…)" | misleading vs the executor (fire-time render, `arm-executors.ts:131-143`) — a doc-comment defect that already misled one draft of this program | one comment edit | review |
| R5 | fork-F1-gated: `AUTOMATION_FIRE_OUTCOMES` + the `automation_fires.outcome` CHECK gain a suggestion terminal | only if the owner wants suggest-time audit rows | **merge-window** (generated baseline; #533/#534 — pin the pre-migrate backup) | contract round-trip + the CHECK derivation test |
| R6 | fork-F6-gated: `ChatInjection` gains `audience` (the legacy field retro dropped) | only if host-only PROMPT-INSPECTION of computed steering is wanted as a first-class property (v1 gets host-only STATE by construction — §4.2 — and ephemeral injections have no member-facing inspector today) | additive optional wire field + assembly honor + every prompt-view surface | the D110-style per-surface sweep — this is the expensive fork arm; priced so the owner sees it |

Unknown-with-probe: **does any member-facing surface render assembled prompts?** (If one exists,
§4.3's "ephemeral = uninspectable" weakens and F6's durable arm strengthens.) PROBE: sweep client
features for consumers of assembly/debug prompt payloads (`pnpm ast refs` on the assemble-trace
read procs + a literal `rg` for the trace proc names in `packages/client/src`); the spec's default
stands unless the probe finds one.

## §7 THE PATH — the complete ordered build plan

Every step: owner hands-on test · merge class · knobs · taxonomy class. Stop-anywhere holds at
every row — each lands green-whole with the byte-identity discipline, and no later row is a
premise of an earlier one's correctness.

**Phase A — substrate (silent; provable, not visible; taxonomy class and knobs n/a — the substrate is class-agnostic plumbing and ships no user knob):**

| Step | Contents | Owner's test | Merge class |
| - | - | - | - |
| A1 = S2+R1+R2 | teaching seam (the FINAL contract incl. the `toolNames` axis — frozen here, never re-typed) + the injections-merge revamp; rpg contributor #0; the two byte pins + double-teach guard + the attach-matrix pin (no contributions ⇒ `[]` byte-identical; a fixture contributor ⇒ exactly its names; capability-absent ⇒ dropped + `tools_unsupported`) | nothing visible; `pnpm test` shows the pins green | ordinary |
| A2 = S1 | control registry + per-mode busy contract; synthetic-descriptor CT | a hand-fired chip renders and clicks in a dev drive | ordinary |
| A3 = S3 | preset data + `createRuleFromPreset`; the v1 preset rows | tRPC create → the rule fires on a real event → fire log | ordinary |
| A4 = S4 | suggestion slice + the NEW automation-bus member (+ belt/coverage/host-filter sites) + confirm/dismiss verbs + the S1 card | a confirm-first preset suggests; host click executes; dismiss drops | ordinary |

**Phase B — the visible grafts (each = one owner test; classes tagged):**

| Step | Graft | Class | Rides | Owner's test | Merge class | Knob |
| - | - | - | - | - | - | - |
| B1 | G1 offer-choices toggle + R3 (wand un-gate) | teaching (class-agnostic prompt) | S2 | any chat: model offers, click composes | ordinary | per-chat `offerChoices` (healed metadata sub-blob; D107 wired both ends; fork F2 on the home) |
| B2 | G2 rules list + preset picker | — (UI) | S3 | enable auto-illustrate; watch it fire | ordinary | per-preset knobs |
| B3 | G3 quick-reply chips | 1 | S1 | a rule surfaces chips; click sends as the member | ordinary | per-rule chip arm |
| B4 | G4 confirm cards | 1 | S1+S4 | confirm-first preset → card → host executes | ordinary (R5 only if F1 flips) | confirmFirst; suggestOnRefusal (F4) |
| B5 | G-I1 imagery client | — (consumes existing verbs) | the 3 unwired procs + `background` mode (`contracts/imagery:17`) | /imagine → edit → set-as-background → provenance | ordinary | none new |
| B6 | G-I2 reactions MR0–MR2 | 2-concurrent (human) | own plane + `message-footer` | react; second tab sees live | **merge-window** (db baseline — pin the backup) | none new |
| B7 | G-I3 reactions MR3–MR5 + R2 first consumer | 2-concurrent (character via tool) | the speaker-span parser (`packages/kit/src/speaker-label/index.ts:64`; grouping-layer fitness = MR3's first task) + the A1-frozen attach axis (first non-empty contributor) + a `react` tool in the ONE registry | react to one speaker's line; the model acknowledges next turn; a character reacts back | ordinary | attribution caps (K + content, #23 ruling G) |
| B8 | G7 checks chip | ask=transient; result=canon provenance (the legacy chip split) | S1 + `rollDice` verb (member-gated CSPRNG bake-once) | chip → server roll → narration reacts | ordinary | game config |
| B9 | G8 clocks | 1 | S3's variables-as-clock preset + a widget rendering `vars` | clock fills; the preset's arm fires | ordinary | N, the fired arm |
| B10 | G9 saved casts | — (membership template) | `rosterMemberSpecSchema`/`seatKnobsSchema` (`contracts/chat/roster.ts:76-99` — pre-cut for this; D80) | save a cast; one click into a new chat | **merge-window** (schema) | per-member seat knobs |

**Phase C — owner-optional rows (each priced, none committed):**

| Step | Item | Class | Cost | Owner's test | Merge class | Fork |
| - | - | - | - | - | - | - |
| C1 | `run_analysis` arm (§4) + the pacing-analysis preset | 1 | 1 arm member + output-op union + executor + dry-run + S2 contribution; NO schema | enable the preset; after N beats the next reply visibly plants/foreshadows; the host's steer knob changes the direction | ordinary | F7 picks the preset set |
| C2 | distill-lore preset (keeper analysis half) | 1 | a preset row + the `upsertLoreEntry` route (span-stamp discipline) | play a settled span; keyed lore entries appear in the book, idempotent on re-run | ordinary | F7 |
| C3 | prose-audit preset (rewrite suggestion card) | 1 | a preset row + the suggest route + the host edit-verb execution path | a flawed reply draws a card; confirm applies the rewrite; clean replies draw nothing | ordinary | F7 |
| C4 | the three zero-machinery presets (lore-reveal ×2, auto-background) | 1 | preset rows only | enable one; the arm fires on its trigger | ordinary | F5-adjacent taste |
| C5 | plugin client + snippets + plugins joining S4 posture 2 | 1 | AFTER the D46 security review (#24) — security lane | install → grant → a plugin chip renders and confirms | per its own plan | — |

**Stop-anywhere, stated per stop:** after Phase A: nothing user-visible changed, all pins green —
a shippable no-op. After B1: chats offer choices. B2: rules as toggles. B3/B4: the room talks back
and asks permission. B5: images without leaving the room. B6/B7: reactions, then reactions that
steer. B8/B9: dice with stakes, visible countdowns. B10: rooms are reusable. Each C-row is
independently skippable forever. No row renames, re-types, or migrates anything an earlier row
shipped (the graft rule, `lite-plus-guided-substrate-spec.md` §0.5).

**§7.4 Acceptance matrix:** the systems-audit authority table (Q2b) is carried as this path's
per-action acceptance floor — every landed step's tests must witness its row (Principal /
triggeredBy-runAs / gate / capability axis) — with THREE corrections baked in over the superseded
text: trigger_turn's triggeredBy = the rule AUTHOR as funder (`turn.ts:2496-2498`); per-mode S1
busy semantics (§3-S1); and the Q2b "budgets (cooldown / per-hour / spend $)" cell is STALE — the
$/day spend ceiling was stripped from automation (`contract/ops.ts:73-75,95-97`); the live gate
set is rate caps + depth + D17 consent.

## §8 Owner forks (all pending; none decided here)

- **F1 — confirm-card persistence.** In-RAM TTL map (DEFAULT; the buddy-proven shape; zero
  schema; audit = bus + confirmed-execution fire rows) vs durable rows (+1 table, +R5
  merge-window, away-host survival, staleness semantics). Legacy pricing refinement: buddy's
  5-min in-RAM was the OWNER-PRESENT number; #14's 72 h durable was the away-host number — the
  fork is really "which presence model do suggestion rooms have."
- **F2 — offer-choices knob home.** Per-chat metadata (DEFAULT — the room-mode reading; rpg's
  per-game knob is the sibling) vs preset-owned (travels with the voice).
- **F3 — reactions merge shape.** Three owner-testable stops (DEFAULT; B6/B7 split) vs one
  program merge (the literal 2026-07-18 maximal ruling — read as scope commitment, not merge
  shape; owner may veto the reading).
- **F4 — `suggestOnRefusal` default.** ON for spend arms (DEFAULT — a silent `budget_refused`
  becomes a host decision) vs OFF.
- **F5 — ladder taste.** Whether B5/B6 land before the A-phase consumers. No dependency either way.
- **F6 (NEW) — computed-steering inspectability.** v1 (DEFAULT): host-only BY CONSTRUCTION
  (author-global state + ephemeral injection; no member-facing prompt inspector — the §6 probe
  guards the premise) vs first-class: re-add `ChatInjection.audience` (R6) + a host plot panel
  (a read surface over the arm's state). The durable arm is the expensive one; buy it on evidence.
- **F7 (NEW) — the analysis-preset set.** Which of pacing / distill-lore / prose-audit ship (any
  subset; the arm C1 is the shared floor). Includes per-preset `apply: direct|confirm` defaults —
  the keeper's legacy DIRECT lore writes vs confirm-first is owner taste per preset.

## §9 Unknowns, each with its resolving probe

1. Member-facing assembled-prompt inspector — §6's probe (ast refs + literal rg). Gates F6's v1
   premise.
2. Speaker-span parser fitness for segment ANCHORING (stable indices + `segmentSpeaker`
   staleness) — MR3's first task: a fixture suite over multi-speaker variants before any reaction
   stores a segment index.
3. `AUTHORS_NOTE_DEFAULT_DEPTH` has no retro constant (legacy import; zero grep hits in
   `packages/contracts/src`) — the S2 guidance contribution needs its depth argued at build (a
   domain constant, PD-63-compliant single placement); probe: read the current in_chat depth
   conventions in `assembly/context.ts` candidate builders before picking.
4. The `run_analysis` window read — "recent selected-lineage window" needs the exact read
   substrate (the memory transcript substrate vs a direct message read); probe: `pnpm ast refs`
   on the fact resolver's message reads + the #29 spec's block-substrate precedent; decide at C1
   build, not before.
5. Whether `holdsAuthority` re-derivation suffices for the analysis arm's LORE writes when the
   author lost host between fire and apply — probe: read `dispatch.ts:115-128`'s exact refusal
   path with a host-handoff fixture at C1's test floor.

## §10 Coverage note (the honesty ledger of this pass)

**Stickler rounds: 2.** Round 1: 7 confirmed findings (1 HIGH — the single-rule preset contract could not express the clock; 2 MEDIUM wall/contract gaps; receipts and column gaps), all folded — the preset contract became multi-rule, the class-1 wall gained the image-post rider, the S2 contract went async with `runAsUserId`, R2 landed at A1, the stripped-spend-ceiling correction propagated. Round 2: per-finding verification to convergence.

Read WHOLE this session or the two prior passes: the primary's draft; the pain inventory; the
carve spec; proposed INDEX; tool-use README + landed table; automation-design 05 + the full
contracts/engine code; plugin README + 04; agent-tool-propose; message-reactions; saved-rosters;
world-state §1–§3 (+ section map); rpg-design 13 (+ rider) and 06 (GM/crew head); chat-crew
README; ledger D17/D19/D59/D108/D109/D110/D137 + the reserved-range note; legacy-main WHOLE
FILES: crew contract/director, members/{director,lorebook-keeper,prose-audit,card-evolution},
verbs/{on-turn-completed,gather-turn-context}, contract/scheduler; buddy observer/react,
verbs/confirm, agency/{proposals,rate-limit}; the containment suite header block; rpg client
chips {folded,check-dice}. Read at SECTION depth (routed, not whole): automation-design 01–04
(the built code was read instead — code outranks its design doc post-graduation), plugin 01–03,
tool-use 01–05, world-state §4–§10, rpg-design 01–05/07–12, chat-crew 01–08. Not read: the
proposed sets with no touchpoint in this direction (expressions, databank, connections,
hub-browse, spatial, autosave, bg-video, ui-cohesion) beyond their INDEX dispositions. The
stickler's mandate included independent spot-reads of both strata.
