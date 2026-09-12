---
kind: design
status: draft
updated: 2026-08-24
---

# THE INTERACTION DIRECTION — definitive specification and the path (claude-b, max-effort pass)

> **THE RULED FINAL — SUPERSEDES** `docs/reviews/stickler/2026-08-24-final-interaction-specification.md`
> (the converged baseline, left unedited), which itself supersedes the two 2026-08-23 docs. This
> revision folds the owner's 2026-08-24 PANEL-PASS RULINGS — **all seven forks are DECIDED, nothing
> remains pending** (§8 records each verdict): F1 in-RAM+TTL · F2 chat-homed knob · F3 three-stop
> reactions · F4 suggestOnRefusal ON for spend arms · F5 ladder order stays taste · F6
> host-only-by-construction, NO UI · **F7 all three analysis presets SHIP** (pacing = direct steer;
> distill-lore = confirm-first; prose-audit = confirm-first) — promoting C1–C3 to COMMITTED path
> rows. It also carries the MULTI-VERIFIER PANEL's findings table (§11) with per-finding
> dispositions. The five earlier commissioning rulings stand unchanged (duplication-not-capability;
> the director-overclaim correction; the INSIDE/OUTSIDE taxonomy spine; no permission snowflakes;
> plain names, closed room vocabulary).
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
  **Second rider (panel P3):** `transform_draft` rewrites a MEMBER's outgoing draft pre-commit
  (target axis `PROMPT_TRANSFORM_POINTS`, first point `user_input` — "after the macro pass,
  before USER\_INPUT regex (the author-side transform order — D51)", `contracts/chat/bus.ts:
  199-201`) — a host-authored template touching prose canon WITHOUT a turn request, attributed to
  the human whose draft it transformed. It bypasses the ops surface entirely (it registers into
  chat's D50 pipeline; the dispatch engine REFUSES it — `arm-executors.ts:302`). Both riders are
  BUILT law (D50/D51), stated here so the wall is honest.
  **ENFORCER, honestly tiered (panel P1):** the op-type contract (compile) stops CALLING a
  nonexistent op but does zero work against ADDING one, and is blind to the transform path — the
  wall's real tier today is REVIEW on any `AutomationOps`/transform-point widening. The recorded
  gate option (unbuilt): an `AutomationOps` surface allowlist in the `bus-payload-allowlist`
  gate shape (`tooling/src/verify/gates/bus-payload-allowlist.ts`). The plugin membrane is the
  same wall for plugins (`PluginHostV1` — read/variables/quick-reply/requestTurn/worldInfo/
  storage, no message write; `contracts/plugin/host-v1.ts:81-119`). NOTE the §1 ops enumeration
  includes `summarizeQuiet` (`ops.ts:176-182`) — the quiet-LLM op §4 widens.
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
  `ctx.rpg.gatherTurnContext(...)` (`turn.ts:560-577`); a `TeachingContribution` is
  `{ id, order, collect(tctx) → Promise<{ injections: ChatInjection[], toolNames: readonly
  string[] }> }` registered at `entry/compose`. ASYNC because real contributions read (the §4.3
  guidance contribution reads a stored variable); contributor #0 stays a trivially-resolved pure
  projection of `tctx.rpgGather?.injections ?? []` with `toolNames: []`. `tctx` carries
  `{ chatId, runAsUserId (the resolved host — sitting at the collection site already,
  turn.ts:599), resolved knob reads, rpgGather: ChatRpgGatherResult | null }`. The gather's
  non-injection outputs (`macros`/`tools`/`terminalTools`/`cardKeepLastX`/`celBindings` —
  `domain/chat/contract/context.ts:526-547`) stay on `ctx.rpg` untouched.
- **The `toolNames` axis (revamp R2, INSIDE this contract):** teach and ATTACH travel together
  (the rpg gather's own shape, generalized). `attachedToolNames` becomes the union of
  contributions' `toolNames` (today: always `[]` — byte-identical; MR5's react tool is the first
  non-empty contributor at B7). This closes the tool-attach gap inside the seam instead of
  bolting a second axis on later. The existing capability honesty gates it per turn
  (`tools_unsupported` drop, `engine/pipeline.ts:676,685-692`). Two more pins (panel P1): a
  contribution's declared tool names must resolve at REGISTRATION (boot-fatal, the tool-collision
  posture) — `resolveTools` THROWS on an unknown name at attach ("at attach time that's our
  bug", `domain/tool-use/contract/errors.ts:3-4`), so an uninstalled plugin tool must never
  reach the per-turn union; and the boundary is stated: ATTACH is capability-wire-gated only —
  AUTHORITY gates run at EXECUTE (the tool's `capability` ceiling + the owning verb's gates
  under the turn principal; `resolveTools` takes no Principal by design,
  `domain/tool-use/contract/service.ts:24`).
- Teach TEXT stays in `PROSE_SLOTS` (`RPG_CYOA_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"].text`,
  `domain/rpg/substrate/reminder.ts:126`; preset-editable, baseline-pinned — 4a5bb8e86). NO second
  prose home. `reminder.ts` itself never moves (its header: THE ONE HOME of the state-line
  grammar, macro-view coupled, reachability-pinned).
- HOME: contribution type in `domain/chat/contract/` (the `ChatRpgOps` sideways-type precedent);
  per-domain modules `domain/<x>/teaching-contribution.ts` — **a NEW feature-root slot that must
  be RATIFIED the D117 way, priced into A1 (panel P1, gate-probed):** the `feature-structure`
  gate reds any unlisted root file (`ALWAYS_ALLOWED_ROOT_FILES = ["guard.ts",
  "workload-contributions.ts"]`, `tooling/src/verify/gates/feature-structure.ts:32` — a planted
  probe went RED), so A1 carries the allowlist entry + the dep-cruiser `pathNot` + a D-entry, the
  exact D117 ratification shape — a deliberate ratification, never a silent allowlist dodge;
  registry assembled at compose. ENFORCER: TWO byte-identity pins (rpg chat identical pre/post per mode ×
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
`chat.messageCount` is already an env binding (`contracts/automation/index.ts:317`), so "every N
beats" is the single predicate `chat.messageCount % N == 0`.

- The preset table (v1 committed + owner-OPTIONAL rows marked ⭘; every row maps to EXISTING arms —
  receipts `contracts/automation/index.ts:160-247`):

| Preset (plain name) | Trigger → arms | Knobs | Status |
| - | - | - | - |
| auto-add lore entries | messageCommitted → `insert_world_info_entry` — **`confirmFirst` BY DEFAULT** (panel P4: the v1 table otherwise ships zero confirm-first rows, making A4/B4's owner tests unrunnable until Phase C; this row is the natural card — "add this lore entry?") | book, key style, confirmFirst | v1 |
| periodic pacing nudge | turnCompleted + counter predicate → `trigger_turn` (guided) | every-N-beats, the nudge text | v1 |
| auto-illustrate scene changes | worldInfoActivated or predicate → `generate_image` | mode, cadence floor | v1 |
| dice chips after a beat | turnCompleted + predicate → `surface_quick_reply` | chip labels | v1 |
| clock fires when full | TWO rules (the multi-rule preset shape): rule 1 = trigger → `set_variable inc` on `vars.X`; rule 2 = same trigger, predicate `int(vars.X) >= N` → the fired arm + a `set_variable set` reset | N, the fired arm | v1 (G8's state home — chat variables, stickler-confirmed swipe-correct: they fold along the selected lineage, `domain/chat/substrate/runtime-variables.ts:1-6`) |
| ⭘ illustrate on lore reveal | worldInfoActivated → `generate_image` | entry filter | owner-optional |
| ⭘ react to lore activation | worldInfoActivated → `trigger_turn` | guided text | owner-optional |
| ⭘ auto-set scene background | predicate → `set_chat_background` (the autobg quiet-pick arm, :236-243) | instruction bias | owner-optional |
| story pacing analysis | §4's analysis arm with the director brief — **apply: DIRECT steer** (RULED F7) | cadence, steer | **committed** (C1) |
| distill lore from play | §4's analysis arm routing to lore ops — **apply: CONFIRM-FIRST** (RULED F7) | span floor, book | **committed** (C2) |
| prose audit | §4's analysis arm routing to a rewrite suggestion card — **apply: CONFIRM-FIRST** (RULED F7) | every-turn vs on-demand | **committed** (C3) |

- HOME: `domain/automation/contract/presets.ts` + `verbs/create-rule-from-preset.ts`; id tuple in
  `@orb/contracts/automation`. ENFORCER: compile (exhaustive `Record<RulePresetId, RulePresetDef>`;
  arms typed against the action union — a retired arm fails tsc at every preset naming it); test:
  per-preset create→fire int test through the real engine. Merge class: ordinary. Free lever
  (corrected semantics): arm templates are macro-rendered at FIRE time in the AUTHOR's env
  (`arm-executors.ts:131-143`) — state-reactive chip text samples surface-time state, and `global`
  is the author's namespace.

### S4 — suggest/confirm (server + S1 card)

The #14 three-posture law over rules (plugins join post-#24): standing authority ⇒ act directly;
no standing authority ⇒ a SUGGESTION the HOST confirms; structured-output-only ⇒ no tools
(D109-4). The fourth-posture redline: direct execution without standing authority never exists.

**TWO suggestion classes (panel redesign — P3 proved the single class could not express RULED F4,
and P5 proved it had a TOCTOU hole):**

1. **Confirm-first cards** (a preset/rule arm marked `confirmFirst`): at fire time, after the
   predicate and env, the arm STASHES instead of executing. The pending record is
   `{ suggestionId, chatId, ruleId, summary, resolvedArm }` minted at suggest — the summary the
   host reads and the arm that executes live in ONE record (the buddy `Proposal` shape,
   `legacy-main:.../buddy/contract/results.ts`); for a REWRITE card (C3) it also carries the
   audited `variantId` + a content hash (the legacy stale-accept guard,
   `legacy-main:.../crew/verbs/proposals.ts` — accept refuses `superseded`/`stale` without
   touching canon). `confirm(suggestionId)` CLAIMS — id-match, take-once, delete-on-take
   (`legacy-main:.../buddy/agency/proposals.ts:40-47` `takeProposal`) — re-checks rule-enabled +
   `holdsAuthority(author)` + (rewrite cards) variant-still-selected + hash-match, then executes
   the STORED `resolvedArm`, never a re-read of `automation_rules.actions`. Double-click and
   replace-races refuse typed, never double-execute.
2. **Rate-refusal invitations** (RULED F4, default ON for spend arms): `budget_refused` fires
   BEFORE the predicate and before any env exists (`dispatch.ts:181-195` — P3's receipt), so no
   arm can be rendered there. The invitation carries the RULE REFERENCE only ("this rule was
   rate-capped — run it now?"); confirm = a host-initiated FRESH run of that one rule (the
   `runRuleNow` verb, §6 R7) — predicate re-evaluated, arms rendered fresh, no stored payload,
   no TOCTOU by construction. The machine-readable spend set is a NEW
   `SPEND_ARM_TYPES` contracts tuple (`trigger_turn`, `generate_image` — today only comments
   mark them, contracts:228,234; compile-pinned; priced).

**Identity at confirm (panel P5, load-bearing):** the executed frame's `authorUserId` STAYS the
RULE AUTHOR — ownership, funding, and state namespace unchanged (every arm executor keys off
`frame.authorUserId`: `arm-executors.ts:97,122-126,223-229`). The CONFIRMER is the AUTHORIZER
only: host-gated, recorded on the fire row. Confirm re-runs `holdsAuthority(author)` exactly as
dispatch does (`dispatch.ts:117-128`) — an author who lost host cannot have their pending arm
executed by the new host (fail-closed; the product consequence — handoff silently voids pending
cards — is flagged to the owner, §8). This closes the by-proxy consent launder P5 demonstrated
(a confirmer-as-funder reading would make a member-triggered hosted-spend flow reach execution
with `isByProxy=false` and no consent verdict — `engine/turn-identity.ts:41-51`).

- Storage: in-RAM pending map, TTL, replace-per-kind within class 1 keyed `(chatId, ruleId)` —
  RULED F1; bounded per chat by its rule count (the buddy precedent covers the mechanism, not
  the cardinality — its map was one-slot-per-user; the TTL sweep discipline is carried
  explicitly). Respawn wipes pending state — accepted. The durable-row alternative stays
  RECORDED (§6 R5) with its criterion.
- Fire-log honesty: `AUTOMATION_FIRE_OUTCOMES` (:65-74) has NO suggestion terminal; adding one
  is a merge-window CHECK edit (§6 R5, unbuilt-recorded). v1 writes no fire row at suggest time;
  the CONFIRMED execution records through the arm path (`fired`), stamped with the confirmer.
- **Priced bus cost (corrected by panel P3):** one NEW host-only `AutomationBusEvent` member +
  its belt entry + bus-coverage sites. NO transport edit — the member filter is default-deny
  (`stream/sources/automation.ts:38,58`: members receive only `quickReplySurfaced`). The
  EXPENSIVE coupled sites land with the FIRST client consumer of this bus (A2/B3): the client
  exhaustive total map over `AutomationBusEvent` + deleting the `SERVER_INTERNAL_REACH`
  exemption row in `bus-definition-belts` (its own stated end condition is the chips UI landing;
  the STALE arm is two-sided — `tooling/src/verify/gates/bus-definition-belts.ts:75-76,232-234`).
- HOME: `domain/automation` suggestion slice; payload wire in `@orb/contracts/automation`; the
  card renders through S1 (`execute` mode; send-mode controls surface the RESOLVED send text on
  the accessible name so label≠send is visible before the click — P5; the rendered `sendText`
  is sliced at a named cap, matching the `post_notification` pattern at `arm-executors.ts:158`).
  ENFORCER: compile (the suggestible-arm summary Record + the SPEND tuple); the authority matrix
  test (non-host refused; disabled rule voids pending; claim take-once; stale rewrite refused;
  author-lost-host refused).

## §4 S5 — the QUIET-ANALYSIS ARM (class 1; the honest director carrier)

**What the legacy director ACTUALLY computed** (read whole; the prior disposal table's "carried by
a guided-template nudge" claim is hereby retracted as an overclaim):

- Durable per-chat plot state: `arc` + `twists[]` + `retiredTwists[]` + `guidance` + a pass
  watermark (`PlotRow`, `legacy-main:packages/server/src/domain/crew/contract/director.ts`).
- A THINK-FIRST structured pass per cadence tick: inputs = recent transcript + current plot + the
  host's standing steer; output = twist-bank ops (add/retire; retire-before-add; `TWIST_CAP`;
  dedup), arc lifecycle (`arcStatus: active|completed`, `successorArc`/`updatedArc`/carry-forward),
  and ONE narrator-facing `guidance` instruction — "plant, foreshadow, or complicate"; **steers
  the NARRATOR's choices, never the players'** (the rule whose validation main-era D93 records (the director brief "passed unqualified … narrator-steering"), verbatim in
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
   schema-constrained model pass over `{ the window (per-route, point 5), the arm's stored
   STATE, the host's steer knob }` → the model returns `{ stateOps, guidance, suggestions[] }` →
   the executor routes each output class. **The model lane (panel-corrected — P1 found the
   D109-2 tension and the one-home doubling, P3 the unpriced seam):** the existing
   `summarizeQuiet` op is WIDENED into the generic quiet-LLM op its own header declares it to be
   ("Generic by design (the extensible shape) — future quiet-LLM arms reuse it",
   `contract/ops.ts:176-182`), gaining a structured variant on the AUTHOR's own
   role-resolved connection (`bindRoleClients(authorUserId)`, the autobg precedent —
   `entry/compose/automation-plugin.ts:183-189`) routed to the `structured` role (D109-4; its
   firewall row excludes the metered sub — `infra/providers/roles/firewall.ts:24,46-48`, so
   hosted-cred laundering is structurally closed). WHY author-scoped resolve rather than D109-2
   turn-inheritance: an automation arm is the AUTHOR's standing side generation (it can fire
   with no committed turn at all — `runRuleNow`), not a call on behalf of a committed turn; the
   author funds their own call under their own consent, no by-proxy triple exists, and the
   sanctioned precedent (autobg) already resolves exactly this way. D109-2's PURPOSE (no second
   hand-rolled resolve that force-stamps consent) is satisfied by reusing the ONE compose-wired
   author resolve. *(Rejected: a bare `runStructuredTurn` import into automation — a second
   quiet-LLM path beside the declared-generic op, the two-homes doubling; rejected: "rides the
   turn like trigger\_turn" — false, the consent walls live inside the turn pipeline the arm
   never enters.)* SPEND-classed: member of the new `SPEND_ARM_TYPES` tuple, rides the fire-rate
   budgets + depth guard.
2. **State home (panel-PIVOTED — three lenses independently refuted the draft's author-globals
   home): a small `automation_rule_state` table** — `ruleId` (FK `automation_rules` CASCADE,
   UNIQUE) · `state` JSON (`$type`d, parse-on-read; carries the analysis state AND the C2
   high-water mark) · `guidance` TEXT (capped `ANALYSIS_GUIDANCE_MAX`, sliced at the write
   boundary) · `updatedAt`. Authority derives ruleId → rule (ownerId, chatId) — D23 clean, chat
   delete cascades transitively, no member read surface exists. WHY the pivot (each a panel
   receipt): author-globals had NO FK (a chat delete orphaned `orb.analysis.<chatId>.*` forever)
   and a chatId-in-a-TEXT-key is the D24 untyped-soft-ref class no gate can see (P1); the C2
   settled-span high-water mark needs a durable home the mark-advance-on-success law can pin
   (P2); guidance needed a capped, VERBATIM store outside the macro plane (P5); and the plugin
   `global_vars` capability was a second, member-egress-capable reader of the author's global
   namespace (P5) — the table has no plugin surface at all. NOT swipe-folded — matching legacy
   `crew_plots` semantics (room-progress-keyed, never variant-keyed). The member-macro fence
   still holds a fortiori (state is not in any macro plane; the macro-env globalVars census
   stands: sole populator `substrate/macro-render.ts:30`, missing-key `""` at
   `kit/src/macro/registry.ts:425`). *(Rejected: the author's global variables — the four
   defects above; the zero-schema saving was false economy against an un-FK'd, gate-invisible,
   plugin-readable home; rejected: `chats.metadata` — host-SET config, never machine output,
   the #29 spec's own rejection.)* **Merge class consequence: C1 is a MERGE-WINDOW row** (one
   baseline table; #533/#534 — pin the backup).
3. **Guidance delivery: an S2 teaching contribution registered by automation** — reads the
   stored guidance (the rule-state row of the chat's enabled analysis rule whose author still
   holds host) and emits ONE ephemeral `in_chat` system injection at the authors-note depth (the
   legacy register; retro's `ChatInjection` carries `position:"in_chat"` + `depth` —
   `contracts/chat/assemble.ts:90-108,119`). **Guidance is DATA, never a template (panel P5 —
   this INVERTS the domain default of macro-rendering every arm string):** stored and delivered
   VERBATIM, never through `renderArmTemplate`/`processMacros` — a model-authored
   `{{getglobalvar::…}}` reaches the assembled prompt as literal braces (pinned test); the
   legacy after-the-macro-pass discipline (`legacy-main:.../crew/substrate/guide-refresh.ts` —
   "the prior guide's model output is NEVER re-scanned as macros") generalized: machine-authored
   injection content is macro-inert, and the splice's `resolveContent` hook (identity in
   production today — P2 verified, `assembly/injections.ts:125-131` with no live supplier) is
   pinned to stay identity for this channel. Ephemeral means no member-inspectable row exists;
   the model always sees it — legacy's `audience:"host"` posture without the field (F6's
   recorded durable arm). Byte-identity: no stored guidance ⇒ `[]` ⇒ untouched assembly.
   **Host-handoff consequence, stated:** fires gate on `holdsAuthority` (author must still hold
   host, `dispatch.ts:116-127`) and the contribution reads only a still-host author's rule-state
   — so on handoff the rule stops firing AND the guidance read yields `[]` ⇒ byte-identical
   assembly. Fail-safe in both directions; the ex-host's rule-state row ages with its disabled
   rule and cascades with the rule/chat.
4. **Suggestions route through S4** (confirm cards) and DIRECT writes route through the arm's
   CLOSED output-op union — v1 members: `setState` (the rule-state write) · `steer` (the guidance
   slot) · `upsertLoreEntry` (the existing `worldInfo.upsertEntries` op the
   `insert_world_info_entry` arm already rides; span-stamped idempotent titles and the
   merge-at-cap discipline adopted from the keeper —
   `legacy-main:.../crew/members/lorebook-keeper.ts` `stampKeeperEntryName`) · `suggest` (an S4
   card). Per-output-class `apply: "direct" | "confirm"` is preset-set — posture 1 vs posture 2
   made data. ENFORCER: the closed union + an exhaustive Record (output class → applier); a new
   class fails tsc.
5. **The read windows, per route (panel P2 — the legacy fresh-vs-settled law, recorded):**
   STEER routes read the FRESH selected-lineage tip (the legacy director deliberately read the
   volatile tip — "its writes are advisory intent, never canon",
   `legacy-main:.../crew/verbs/read-director-inputs.ts`); DURABLE-WRITE routes (`upsertLoreEntry`)
   read a SETTLED span behind a protect tail, tracked by a HIGH-WATER MARK in the rule-state row
   that advances ONLY on successful apply — a failed run leaves it unmoved so a retry re-covers
   the span (the legacy retryability contract: `PROTECT_TAIL` in
   `legacy-main:.../crew/substrate/constants.ts`; mark-advance inside
   `legacy-main:.../crew/verbs/apply-keeper-result.ts`). This is what makes C2's
   "idempotent on re-run" owner test mechanically true.
6. **The fence against #29:** the reconciler (`world-state-clips-trackers-spec.md` §3) is derived
   TRUTH — a watermarked, rebuild-on-hash-mismatch pure function of canon, memory-owned, whose
   rows are destroyable and re-derivable. The analysis arm is authored DIRECTION — forward-looking
   steering state that is NOT a function of canon (the same transcript admits many arcs) and is
   NEVER rebuilt from it. They share no store, no vocabulary, no workload. When #29 wakes, its
   reconciler must not absorb this arm, and this arm must never grow tracker/clip synthesis —
   the boundary test: "could a rebuild from canon reproduce it?" yes ⇒ #29's; no ⇒ this arm's.
7. **What is deliberately NOT rebuilt:** the crew domain, the workload scheduler, `crew_plots`,
   the `audience` field, any member identity. One engine, one watcher, one budget stack —
   ruling 1's exact demand. Cadence = the single predicate `chat.messageCount % N == 0`
   (`chat.messageCount` is an env binding, `contracts/automation/index.ts:317` — no counter
   variable, no second rule) plus `event.turn.automationDepth == 0` guards — the legacy
   turn-counter's semantics without a scheduler and without state.

- **Costs, priced (panel-completed):** contracts — 1 new `AUTOMATION_ACTION_TYPES` member
  (+ the EXACT tuple pin `tests/contracts/automation/index.contract.test.ts:125-133` — a vitest
  `toEqual`, invisible to `pnpm check`, so the behavioral suite is owed) + schema arm + the
  output-op union + the `SPEND_ARM_TYPES` tuple + the client-visible preset projection
  (id/title/knob descriptors) in `@orb/contracts/automation` (a server↔client shape homes in
  contracts — the CEL sources and handlers stay domain-side); engine — the executor + dry-run
  preview arm (`substrate/dry-run.ts`) + a `substrate/validate.ts` admission row (the
  per-arm-rule slot: `post_notification` cooldown floor / `transform_draft` exclusivity live at
  :45,56-61 — the SPEND-classed analysis arm plausibly wants a cadence floor) + the widened
  quiet op across its measured \~11-site footprint (op signature, executor call, two compose
  wirings, six test doubles — P3's census) + a `SIDE_GEN_POSTURES` catalog member (the
  `no-hardcoded-side-gen-sampling` gate reds any literal sampling numbers — the autobg
  precedent `SIDE_GEN_POSTURES.autobg`); db — the `automation_rule_state` table (the
  merge-window); S2 — the automation teaching contribution; client — the refusal copy-mapper
  rows (the main-era D83 refusal-vocabulary PATTERN, cited as pattern, not live law — D83 has
  no retro entry) + the fire-log row rendering. Merge class: **merge-window** (the state
  table). Test floor: golden pass
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
| crew lorebook-keeper | distill durable keyed lore from settled play (span-stamped, idempotent, merge-at-cap, never secrets unrevealed on-screen — `legacy-main:.../members/lorebook-keeper.ts`) | template half: `insert_world_info_entry` (live arm); ANALYSIS half: the `run_analysis` arm's `upsertLoreEntry` route (⭘ "distill lore from play" preset) | carried — committed (C2) |
| crew director — cadence half | fire every N beats | a rule predicate — the stateless `chat.messageCount % N` form (the counter-variable shape also exists via the clock preset). Honesty line (panel P2): legacy reset its counter ONLY on a real enqueue, so a refused pass fired on a later beat; the modulo form loses a refused tick until the next multiple — F4's refusal-invitation card substantially covers the budget-refusal case, lock-conflict refusals wait | carried (live engine) |
| crew director — ANALYSIS half | think-first pass: arc + twist bank + ONE narrator-only guidance (the prior table OVERCLAIMED this as carried; it was not) | the `run_analysis` arm + the ⭘ "story pacing analysis" preset + the S2 guidance contribution (§4) | **spec'd here; committed (C1, RULED F7)** |
| crew prose-audit | post-turn quiet audit → clean/issues verdict + full conservative rewrite (`legacy-main:.../members/prose-audit.ts`) | the `run_analysis` arm routing a rewrite SUGGESTION through S4 — WITH the legacy correctness heart carried (panel P2): the card pins the audited `variantId` + content hash, confirm refuses `superseded`/`stale` without touching canon (`legacy-main:.../crew/verbs/proposals.ts`), and the confirmed rewrite must be REVERTIBLE (the restore-original lesson — mechanism decided at C3 build: a variant-preserving edit or an `originalContent` stamp) | committed (C3, RULED F7) |
| crew card-evolution | earned-evolution card proposals, append-over-replace, empty-is-common | refinery `apply-fields`/`apply-as-copy` + pre-apply snapshot (owner workshop; `domain/refinery/contract/service.ts:2-5`) — the room/library line keeps it OUT of rules (rooms must not mutate cross-room library identity) | carried (manual) |
| crew persistent guides | labeled persisted steering injections, auto-refresh — WITH the refresh-loop semantics the wake-time builder inherits (panel P2): `{{previousGuide}}` continuity (prior content rides the next refresh prompt), blank-output-refuses-to-overwrite (`GuideRefreshEmptyError` — a failed side-gen never destroys standing content), disable-flushes-content-keeps-definition; legacy refresh was deliberately FREE-TEXT, not structured — a fork at wake | NOT carried v1 — parked with a named doorway: a `run_analysis` output class writing a labeled `chat_injections` row via a chat op is the additive shape IF wanted; overlaps #29's trackers — boundary decided when either wakes | parked |
| buddy observer/reactions | ambient per-user signal→quip/mood loop (`legacy-main:.../buddy/observer/react.ts` — cooldown, CAS, dedup, canned fallback) | nothing — dead scope (the companion, not the room direction); its ENGINEERING patterns (cooldown-class rate gates, never-throw-into-the-bus isolation) already live in the automation engine | dead |
| buddy propose/confirm | act-only-with-consent, in-RAM TTL, kill switch + hourly cap at confirm | S4 (the same shape, generalized; receipts §3-S4) | carried (recreated) |
| echo-chamber | ambient multi-voice chatter | dead (was buddy-subsumed; buddy is dead) | dead |
| agent principals (#13) | an AI with its OWN principal + ceiling (the containment suite proved the walls: sessions never mint an agent Principal; disable ⇒ nothing; cascade clean — `legacy-main:tests/server/domain/admin/containment.suite.int.test.ts` header) | parked WHOLE on the owner's explicit want; class-2-sequential is its slot when it wakes; the containment-suite design is the re-proof template then | parked |
| agent tool-propose (#14) | propose-flavored tools for a seated agent | superseded by S4; spec kept as the historical argument | superseded |
| crew structured-output rule | "an actor is not a proposer" | `runStructuredTurn` + the `structured` role (D109-4) | carried |
| GM seat | standing per-game authority object | dormant DDL (`rpg_games.gmUserId` nullable, `db/schema/rpg.ts:58-81`) — full-mode graft | dormant |
| **rpg-mode crew** (panel P2 — a second, richer purged director system this table previously omitted) | world-gen SECRET campaign spine · HIDDEN clocks (distinct from G8's visible vars-clocks) · session recap + session distill (durable summary, conservative secret-spine rewrite, earned sheet deltas, the 65/35 trim) · scene fork/fold (side room with hidden scenario, outcome folded back as canon summary) · recruit-card author (`legacy-main:packages/server/src/domain/rpg/substrate/crew-prompts.ts` + `crew-apply.ts`; verified purged — zero `hiddenClock` hits on retro) | nothing — PARKED whole with the full-mode graft (`docs/architecture/history` rpg-design 06–07 doorway); its twist-merge semantics independently agree with §4's | parked |

## §6 REVAMPS — existing code this direction changes (not adds)

| # | What changes | Why | Migration shape | Pinned by |
| - | - | - | - | - |
| R1 | `domain/chat/verbs/turn.ts` injections merge → the S2 collection (`buildTurnContext`, after the rpg gather) + `ChatContext` gains the teaching registry input (null = today) | one teaching home | additive op, null-op default (the `rpg` null-op precedent — `rpg: input.rpg ?? null`, `entry/compose/chat.ts:1235`) | the two S2 byte-identity pins |
| R2 | `turn.ts:627` `attachedToolNames` → union over S2 contributions' `toolNames` (rpg contributor keeps returning `[]`). **Lands WITH A1** — the contract freezes once; B7 is merely its first non-empty contributor | class-2-concurrent needs a sanctioned attach path; today none exists | additive; empty-union ⇒ byte-identical | an attach matrix test (no contributions ⇒ `[]`; MR5's contributor ⇒ exactly its names; capability-absent ⇒ dropped + `tools_unsupported`) |
| R3 | `composer-utility-menu.tsx:214-229` — "Offer choices" un-game-gated (renders in plain chats when the offer-choices knob context exists) | G1's one-shot sibling is game-only today; the standing/momentary pair should exist wherever the fence renders (it renders everywhere) | client-only; the game arm unchanged | CT: menu shows the item in a non-game chat; teach text = the same prose slot family |
| R4 | `contracts/automation/index.ts:214` comment "(rendered at click time…)" | misleading vs the executor (fire-time render, `arm-executors.ts:131-143`) — a doc-comment defect that already misled one draft of this program | one comment edit | review |
| R5 | **UNBUILT-RECORDED (RULED F1)**: `AUTOMATION_FIRE_OUTCOMES` + the `automation_fires.outcome` CHECK gaining a suggestion terminal is the FLIP SHAPE if the F1 criterion ever fires | recorded so nobody re-derives it | would be **merge-window** (generated baseline; #533/#534 — pin the pre-migrate backup) | contract round-trip + the CHECK derivation test, when/if built |
| R6 | **UNBUILT-RECORDED (RULED F6: host-only-by-construction, NO UI)**: `ChatInjection.audience` (the legacy field retro dropped) is the flip shape if first-class inspection is ever wanted | v1 gets host-only STATE by construction (§4.2) and ephemeral injections have no member-facing inspector today — the §6 probe still RUNS at C1 build as the premise guard | additive optional wire field + assembly honor + every prompt-view surface | the D110-style per-surface sweep — recorded pricing, when/if built |
| R7 | NEW verb `runRuleNow(chatId, ruleId)` — host-gated, executes ONE rule's dispatch fresh under a host-initiated fact (depth 0) | the F4 refusal-invitation's confirm half; B2's "run it now" recovery action; C3's on-demand mode; legacy `runNow` was exactly this host manual trigger (`legacy-main:.../crew/verbs/run-now.ts`) — retro's `testRule` deliberately executes NOTHING (`verbs/test-rule.ts:1-5`) so no existing verb covers it | additive verb + tRPC proc + cross-tenant sweep row (PROBED) | the authority matrix (host-only v1; legacy's member-with-host-consent-via-enablement recorded as the widening shape, `legacy-main:.../crew/verbs/request-prose-audit.ts`) |

Unknown-with-probe (RESOLVED by panel P4): **does any member-facing surface render assembled
prompts?** ANSWERED — the context panel's assembly Preview tab is the one such surface and it is
HOST-ONLY (server-gated; "a member never reaches the queries" —
`packages/client/src/features/chat/components/assembly-preview-panel.tsx:1-18`), with a DEFERRED
member-scoped `previewSection` affordance flagged (#28) — **that deferred affordance is F6's
tripwire**: whoever ships it must re-derive F6's premise first. The original probe text is kept
below for provenance only.
Original probe: **does any member-facing surface render assembled prompts?** (If one exists,
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
| A4 = S4 | suggestion slice (BOTH classes: stored-arm cards + refusal invitations) + the NEW automation-bus member (+ belt/coverage sites; no transport edit — default-deny) + `SPEND_ARM_TYPES` + confirm/dismiss + R7 `runRuleNow` + the S1 card | the confirm-first "auto-add lore entries" preset (default per P4) suggests; host click executes; dismiss drops; a rate-capped spend rule raises the run-now invitation | ordinary |

**Phase B — the visible grafts (each = one owner test; classes tagged):**

| Step | Graft | Class | Rides | Owner's test | Merge class | Knob |
| - | - | - | - | - | - | - |
| B1 | G1 offer-choices toggle + R3 (wand un-gate) | teaching (class-agnostic prompt) | S2; the toggle surfaces in the chat settings section family | any chat: model offers, click composes | ordinary | per-chat `offerChoices` (healed metadata sub-blob; D107 wired both ends) — **RULED F2: chat-homed**; the chat knob resolves against a per-user DEFAULT in settings (the `groupDefaults` tier precedent, `contracts/settings/index.ts:827`) so new rooms are born with the user's posture (panel P4's cold-start fix) |
| B2 | G2 rules list + preset picker | — (UI) | S3 + the two BUILT-unwired feedback verbs (panel P4): the list renders `listFires` ("why didn't my rule fire" — contracts:62-64), each rule carries Test (`testRule` dry-run) + Run now (R7). ANCHORS: the dormant automation home tile is the door (`features/home/lib/automation-tile.tsx:1-24` — RETIRES at B3 per its own stated contract) + a rules section in the chat settings section family. v1 knob-edit path stated: re-mint from the picker; post-mint knob editing is the recorded flip shape (`preset_id` + `knobs` provenance on `automation_rules`, merge-window, unbuilt-recorded) | enable auto-illustrate; the fire log shows it; press Test and Run now | ordinary | per-preset knobs |
| B3 | G3 quick-reply chips | 1 | S1 | a rule surfaces chips; click sends as the member | ordinary | per-rule chip arm |
| B4 | G4 confirm cards — what B4 ADDS over A4 (panel P4): the two knobs surfaced per rule (confirmFirst, suggestOnRefusal) + the card polish pass; A4 proved the mechanism, B4 makes it configurable | 1 | S1+S4 | flip a rule to confirm-first in B2's list; its next fire suggests instead of executing | ordinary (RULED F1: no fire-row at suggest time; R5 unbuilt-recorded — §6) | confirmFirst; suggestOnRefusal — **RULED F4: default ON for spend arms** |
| B5 | G-I1 imagery client | — (consumes existing verbs) | the 3 unwired procs + `background` mode (`contracts/imagery:17`) | /imagine → edit → set-as-background → provenance | ordinary | none new |
| B6 | G-I2 reactions MR0–MR2 | 2-concurrent (human) | own plane + the `message-footer` anchor (`CHAT_SURFACE_ANCHORS`, `packages/client/src/lib/contribution-contracts.ts:27`) + **the `reactionsChanged` CHAT-bus member with its FULL coupled-site list (panel P3 — the same class of cost S4 prices on its own bus): union member + `CHAT_BUS_EVENT_TYPES` belt + the durable-vs-live-only partition call + (if durable) the `chat_events.type` CHECK + the EXACT-count pin `toHaveLength(29)` (`tests/contracts/chat/index.contract.test.ts:60`) + the partition pin (:73-76) + the client apply-arm exhaustiveness (`tests/client/data/bus/apply-chat-bus-event.test.ts:469-475`) + the `bus-coverage` gate arm — the three test sites are vitest, invisible to `pnpm check`; the behavioral suites are owed at this row** | react; second tab sees live | **merge-window** (db baseline — pin the backup) | none new. Ordering flag under RULED F5 (taste): B6 is Phase B's cost outlier with its smallest standalone payoff — recommend scheduling as the front half of a B6+B7 unit; the stops remain separately landable (F3 unchanged) |
| B7 | G-I3 reactions MR3–MR5 + R2 first consumer | 2-concurrent (character via tool) | the speaker-span parser (`packages/kit/src/speaker-label/index.ts:64`; grouping-layer fitness = MR3's first task) + the A1-frozen attach axis (first non-empty contributor) + a `react` tool in the ONE registry | react to one speaker's line; the model acknowledges next turn; a character reacts back | ordinary | attribution caps (K + content, #23 ruling G) |
| B8 | G7 checks chip | ask=transient; result=canon provenance (the legacy chip split) | S1 + `rollDice` verb (member-gated CSPRNG bake-once) | chip → server roll → narration reacts | ordinary | game config |
| B9 | G8 clocks | 1 | S3's variables-as-clock TWO-rule preset + a widget rendering `vars` (render home named at build — the chat settings/room surface family; no automation client consumer exists today, panel P4) | clock fills; the preset's arm fires; host resets it | ordinary | N, the fired arm |
| B10 | G9 saved casts (the parked #26 program, named — panel P1) | — (membership template) | `rosterMemberSpecSchema`/`seatKnobsSchema` (`contracts/chat/roster.ts:76-99` — pre-cut for this; D80) + the room's enabled PRESET IDS + KNOB VALUES, re-minted on apply through A3's `createRuleFromPreset` (panel P4: the accrual half travels; this stored pair doubles as B2's knob-provenance flip-shape record) | save a cast + its rules; one click into a new chat, rules included | **merge-window** (schema) | per-member seat knobs + preset ids/knobs |

**Phase C — COMMITTED analysis rows (RULED F7) + the remaining optional tail:** C1–C3 are
committed path rows with the ruled apply postures (C1 pacing = direct steer; C2 distill-lore =
confirm-first; C3 prose-audit = confirm-first); C4 stays owner-optional taste; C5 stays gated on
\#24. Stop-anywhere still holds: the path may stop after ANY of C1..C3 — each preset is a
separately-landable rule-set + routes over the one C1 arm, and B1–B10 remain complete without any
of them.

| Step | Item | Class | Cost | Owner's test | Merge class | Fork |
| - | - | - | - | - | - | - |
| C1 | `run_analysis` arm (§4) + the pacing-analysis preset | 1 | the §4 priced list (arm member + tuple pin + output-op union + widened quiet op + executor + dry-run + validate row + SIDE\_GEN\_POSTURES member + S2 contribution + **the `automation_rule_state` table**) | enable the preset; after N beats verify the guidance line in the HOST's assembly Preview tab (Steering source — the existing host-only instrument, `assembly-preview-panel.tsx:1-18`), THEN judge the prose; the steer knob changes the direction. Game-chat interplay (panel P2): the analysis presets' mint REFUSES on an active-game chat v1 (typed refusal — the game owns its own steering per D109; the legacy no-double-director law re-derived, `legacy-main:.../crew/verbs/config.ts` `CREW_ACTIVE_GAME`), revisitable | **merge-window** (the state table — #533/#534, pin the backup) | committed (RULED F7; apply: direct steer) |
| C2 | distill-lore preset (keeper analysis half) | 1 | a preset row + the `upsertLoreEntry` route (span-stamp discipline + the settled-span/high-water law, §4.5 — the mark lives in the rule-state row) + `neutralizeMacros` on the model→lore content (panel P5: world-info content IS a macro-EXECUTION plane at assembly — `assembly/context.ts:225` full `renderMacros`, op-log persisted `engine/engine.ts:249` — while message rows are not; the house untrusted-splice primitive, `kit/src/macro/content.ts:19`, one call) | play a settled span; a confirm card offers the entries; confirm lands them, idempotent on re-run | ordinary | committed (RULED F7; apply: confirm-first) |
| C3 | prose-audit preset (rewrite suggestion card) | 1 | a preset row + the suggest route (variant-pinned + content-hashed card, §5's carried correctness heart) + the host edit-verb execution path + the revert obligation (mechanism at build) | a flawed reply draws a card; confirm applies the rewrite; a swipe between suggest and confirm refuses typed; clean replies draw nothing. On-demand = R7 `runRuleNow` (host-only v1), whose synchronous return carries the clean verdict (the legacy transient-clean lesson: a no-row clean outcome must be distinguishable from "never ran") | ordinary | committed (RULED F7; apply: confirm-first) |
| C4 | the three zero-machinery presets (lore-reveal ×2, auto-background) | 1 | preset rows only | enable one; the arm fires on its trigger | ordinary | F5-adjacent taste |
| C5 | plugin client + snippets + plugins joining S4 posture 2 | 1 | AFTER the D46 security review (#24) — security lane | install → grant → a plugin chip renders and confirms | per its own plan | — |

**Stop-anywhere, stated per stop:** after Phase A: nothing user-visible changed, all pins green —
a shippable no-op. After B1: chats offer choices. B2: rules as toggles. B3/B4: the room talks back
and asks permission. B5: images without leaving the room. B6/B7: reactions, then reactions that
steer. B8/B9: dice with stakes, visible countdowns. B10: rooms are reusable. Each C-row is
independently skippable forever. No row renames, re-types, or migrates anything an earlier row
shipped (the graft rule, `docs/design/lite-plus-guided-substrate-spec.md` §0 item 5).

**§7.4 Acceptance matrix:** the systems-audit authority table (Q2b) is carried as this path's
per-action acceptance floor — every landed step's tests must witness its row (Principal /
triggeredBy-runAs / gate / capability axis) — with THREE corrections baked in over the superseded
text: trigger\_turn's triggeredBy = the rule AUTHOR as funder (`turn.ts:2496-2498`); per-mode S1
busy semantics (§3-S1); and the Q2b "budgets (cooldown / per-hour / spend $)" cell is STALE — the
$/day spend ceiling was stripped from automation (`contract/ops.ts:73-75,95-97`); the live gate
set is rate caps + depth + D17 consent.

## §8 The seven rulings (owner, 2026-08-24 panel pass — all DECIDED, recorded with their flip shapes)

- **F1 — RULED: in-RAM + TTL** (the buddy-proven shape; zero schema; audit = bus + confirmed-
  execution fire rows). The durable-row alternative stays recorded (§6 R5) with its criterion:
  wanted suggestions expiring unseen in host-absent rooms.
- **F2 — RULED: chat-homed** `offerChoices` knob (the room-mode reading; rpg's per-game knob is
  the sibling).
- **F3 — RULED: three-stop reactions** — the B6/B7 split stands (scope stays the maximal
  2026-07-18 commitment; merge shape is one owner-testable stop at a time).
- **F4 — RULED: `suggestOnRefusal` default ON for spend arms** (a silent `budget_refused` becomes
  a host decision); per-rule knob retained.
- **F5 — RULED: ladder order stays fun-per-effort taste** — no fixed sequence beyond the
  dependency classes.
- **F6 — RULED: host-only-by-construction, NO UI.** Rule-state table (no member/plugin surface) + ephemeral injection;
  `ChatInjection.audience` and any plot panel stay unbuilt-recorded (§6 R6); the member-facing
  prompt-inspector probe still runs at C1 build as the premise guard.
- **F7 — RULED: ALL THREE analysis presets SHIP** — pacing (apply: direct steer), distill-lore
  (confirm-first), prose-audit (confirm-first). C1–C3 are committed path rows (§7 Phase C).

**ONE item back to the owner (panel P5):** on host handoff, the fail-closed default this spec
adopts (confirm re-runs `holdsAuthority(author)`) silently VOIDS every pending card whose author
lost host. Security's default is refuse; whether the new host should instead be OFFERED the
orphaned suggestions (re-minted under their own authority) is a product call the owner should
make explicitly rather than inherit from a security default.

## §9 Unknowns, each with its resolving probe

1. RESOLVED (panel P4): the one assembled-prompt surface is the HOST-ONLY assembly Preview tab
   (`assembly-preview-panel.tsx:1-18`); the deferred member `previewSection` affordance (#28
   flag) is F6's recorded tripwire. The C1-build probe is now a one-line re-confirm, not a
   sweep.
2. Speaker-span parser fitness for segment ANCHORING (stable indices + `segmentSpeaker`
   staleness) — MR3's first task: a fixture suite over multi-speaker variants before any reaction
   stores a segment index.
3. `AUTHORS_NOTE_DEFAULT_DEPTH` has no retro constant (legacy import; zero grep hits in
   `packages/contracts/src`) — the S2 guidance contribution needs its depth argued at build (a
   domain constant, PD-63-compliant single placement); probe: read the current in\_chat depth
   conventions in `assembly/context.ts` candidate builders before picking.
4. The `run_analysis` window READ SUBSTRATE (which module serves the selected-lineage text) —
   the per-route LAW is now fixed (§4.5: fresh tip for steer, settled span + high-water mark for
   durable writes); only the substrate choice remains. Probe unchanged: `pnpm ast refs` on the
   fact resolver's message reads + the #29 block-substrate precedent; decide at C1 build.
5. RESOLVED (panel P5, folded): confirm-time identity is pinned (§3-S4 — author stays the frame,
   `holdsAuthority(author)` re-run at confirm; the host-handoff fixture is a named C1/C3 test
   floor row; the product half is the §8 owner item).

## §11 THE PANEL — findings table (five parallel lenses; adjudicated by the author, no silent drops)

Panel: P1 LAW (verifier) · P2 LEGACY-COMPLETENESS (stickler; 46 legacy files read beyond §10's
ledger) · P3 COST/RECEIPT (verifier; 40+ receipts re-verified) · P4 PRODUCT/FUN (verifier) ·
P5 TRUST-BOUNDARIES (security-executor — the fifth lens I added: the spec introduces
host-confirmed execution, model-written lore, and macro-rendered templates, and no prior round
had examined it with a security lens). 39 findings; dispositions below. FOLDED = the spec text
above now carries it (section named). REFOLDED-STRUCTURAL = the fold changed a design decision.

| # | Lens | Finding (compressed) | Disposition |
| - | - | - | - |
| 1 | P1 | `run_analysis` model lane vs D109-2; "like trigger\_turn" false (consent walls live inside the turn pipeline) | REFOLDED-STRUCTURAL → §4.1: author-scoped resolve via the widened quiet op (the autobg precedent); the D109-2 tension argued and closed |
| 2 | P1 | `summarizeQuiet` is the declared-generic quiet-LLM op; a second path = two-homes; §1's wall enumeration omitted it | REFOLDED-STRUCTURAL → §4.1 widens the op; §1 enumeration repaired |
| 3 | P1 | `teaching-contribution.ts` reds the `feature-structure` gate (planted probe went RED) | FOLDED → §3-S2: A1 prices the D117-shape ratification (allowlist + cruiser + D-entry) |
| 4 | P1 | author-globals state home: no FK, D24 soft-ref invisible to gates, no enforcer | REFOLDED-STRUCTURAL → §4.2: the `automation_rule_state` table (C1 → merge-window) |
| 5 | P1 | F6 "by construction" premise had no enforcer against future globalVars staging | FOLDED-BY-PIVOT → state left the macro plane entirely (finding 4); the macro-env census stays as a pinned test |
| 6 | P1 | R2 pin matrix missed the attach-time throw + the no-Principal-at-attach boundary | FOLDED → §3-S2: boot-fatal name resolution + attach-vs-execute authority boundary stated |
| 7 | P1 | class-1 wall enforcer vacuous (stops calling, not adding) | FOLDED → §1: honest review-tier + the recorded allowlist-gate option |
| 8 | P1 | `SIDE_GEN_POSTURES` member unpriced | FOLDED → §4 cost list |
| 9 | P1 | D82 mis-cited (validation is main-era D93); "D83" has no retro entry | FOLDED → §4 cites D93; D83 restated as main-era pattern, not live law |
| 10 | P1 | #26 never named at B10; `RulePresetDef` client half needs a contracts home | FOLDED → B10 names #26; §4 cost list homes the client projection in contracts |
| 11 | P2 | prose-audit's variant-pin + content-hash + restore-original dropped by the carrier | FOLDED → §3-S4 class-1 cards + §5 row + C3 |
| 12 | P2 | rpg-mode crew (secret spine, hidden clocks, recap/distill, scene fork/fold, recruit cards) had NO disposition row | FOLDED → §5 new parked row |
| 13 | P2 | settled-span + high-water-mark law missing from C2's durable route | FOLDED → §4.5 (new point) + C2; the mark homes in the rule-state row |
| 14 | P2 | machine-authored injection content's macro posture unstated (the `resolveContent` hook exists) | FOLDED → §4.3: guidance is macro-inert data, pinned |
| 15 | P2 | no-double-director exclusion neither carried nor dead | FOLDED → C1: analysis-preset mint refuses on active-game chats v1 |
| 16 | P2 | legacy `runNow` (manual executing trigger) + the transient clean verdict dropped | FOLDED → §6 R7 `runRuleNow` + C3's synchronous clean verdict |
| 17 | P2 | on-demand trigger authority unstated (legacy: member-with-host-consent) | FOLDED → R7: host-only v1, legacy shape recorded as the widening |
| 18 | P2 | parked guides row under-records three refresh-loop semantics + the free-text fork | FOLDED → §5 row enriched |
| 19 | P2 | cadence "carried" row loses refusal-defers-the-pass | FOLDED → §5 honesty line |
| 20 | P3 | `transform_draft` falsifies the class-1 wall (prose canon, no turn, no attribution stamp; enforcer blind) | FOLDED → §1 second rider |
| 21 | P3 | B6's `reactionsChanged` chat-bus member: 8 coupled sites unpriced incl. the `toHaveLength(29)` exact pin (vitest-tier) | FOLDED → B6 row carries the full list |
| 22 | P3 | RULED F4 inexpressible: no machine-readable spend set; `budget_refused` fires pre-env/pre-predicate so no card can render | REFOLDED-STRUCTURAL → §3-S4 class 2 (refusal INVITATIONS, fresh run via R7) + the `SPEND_ARM_TYPES` tuple |
| 23 | P3 | S4 bus price: phantom transport arm (default-deny needs no edit); missing client total map + `SERVER_INTERNAL_REACH` exemption-row deletion | FOLDED → §3-S4 corrected pricing (lands with the first client consumer, A2/B3) |
| 24 | P3 | `run_analysis` model-call seam unpriced (\~11-site quiet-op footprint; `summarizeQuiet` not reusable as-is) | FOLDED → §4.1 + cost list (the widened op) |
| 25 | P3 | `AUTOMATION_ACTION_TYPES` exact tuple pin + validate.ts admission row unpriced | FOLDED → §4 cost list |
| 26 | P3 | buddy precedent covers mechanism not cardinality (one-slot-per-user vs per-(chat,rule)); TTL sweep not carried by citation | FOLDED → §3-S4 storage bullet |
| 27 | P3 | receipt drift: :315→:317 (×2), :600→:599, :561→:560, autobg range, assemble.ts range, lite-plus-guided path + §0.5, `message-footer` had no receipt | FOLDED → cites corrected throughout; anchor receipt added at B6 |
| 28 | P4 | zero v1 confirm-first presets — A4/B4 owner tests unrunnable until Phase C | FOLDED → "auto-add lore entries" confirmFirst by default; A4/B4 tests restated |
| 29 | P4 | knobs frozen at mint, no provenance — the rejected admin console returns through the back door | FOLDED → B2 states the v1 re-mint path + the recorded provenance flip shape; B10's stored pair doubles as the record |
| 30 | P4 | cold start: no per-user default for offer-choices; B10 carried membership only | FOLDED → B1 (the `groupDefaults`-tier default) + B10 (preset ids + knobs travel) |
| 31 | P4 | B2 leaves BUILT `listFires`/`testRule` unwired — no feedback surface until C1 | FOLDED → B2 renders both + Run now |
| 32 | P4 | three rows had no render home; the dormant automation home tile becomes a LIE at B3 unless retired | FOLDED → B1/B2/B9 anchors named; tile retirement scheduled at B3 |
| 33 | P4 | C1's payoff unobservable — and the probe of §9 unknown 1 is ALREADY ANSWERABLE (host-only Preview tab exists; member affordance deferred #28) | FOLDED → C1's owner test uses the Preview tab Steering row; §9 unknown 1 RESOLVED with the tripwire recorded |
| 34 | P4 | C3's "on-demand" knob named a mode with no invocation surface | FOLDED → R7 (`runRuleNow`) is the surface |
| 35 | P4 | B6 is Phase B's cost outlier with the least standalone payoff (flag, not cut) | FOLDED → B6 ordering flag under RULED F5; F3 stops unchanged |
| 36 | P5 | S4 TOCTOU: replace-per-kind + no claim = confirming a card the host never read; double-execute | REFOLDED-STRUCTURAL → §3-S4: one-record {id, summary, resolvedArm}, take-once claim, stored-arm execute |
| 37 | P5 | "under the CONFIRMER's Principal" ambiguous; confirmer-as-funder LAUNDERS the D17 by-proxy verdict on handoff | REFOLDED-STRUCTURAL → §3-S4 identity paragraph: author stays the frame; confirmer = authorizer; `holdsAuthority(author)` re-run; the handoff product call flagged to the owner (§8) |
| 38 | P5 | DIRECT-steer guidance rendered as a template would read the host's whole global KV into the prompt; guidance uncapped | FOLDED (and mooted in part by the state pivot) → §4.3 verbatim-data pin + `ANALYSIS_GUIDANCE_MAX`; §4.2's table has no macro-plane surface |
| 39 | P5 | model→lore is a macro-EXECUTION plane (op-log persisted) while messages are not; plugin `global_vars` was a second reader of author globals; `surface_quick_reply` rendered output uncapped + label≠send | FOLDED → C2 `neutralizeMacros`; the plugin reader mooted by the state pivot (noted; the global-vars keyspace generally stays on #24's review); §3-S4 sendText cap + the accessible-name clause |

REFUTED: none — every panel finding survived adjudication (the panel's own two self-refuted
candidates — the buddy signal-router feedback guard and the strong form of the macro-scan claim —
were killed inside P2's process and never reached this table). P5's boundaries-verified-HELD list
(member `{{getglobalvar}}` isolation, CEL `global` isolation, inert `{{setglobalvar}}` on chat
turns, the structured-role firewall's metered-sub exclusion, trigger\_turn's D17 walls, bus
tiering, CSRF/frame-ancestors on the confirm mutation, macro env values emitted-not-reparsed,
`holdsAuthority` + the DEF-11 re-entry gate) stands as the spec's security baseline.

## §10 Coverage note (the honesty ledger of this pass)

**Stickler rounds: 2 (baseline) + the FIVE-LENS PANEL (this revision: 39 findings, 0 refuted, 6 structural refolds) + one post-fold verification round.** Round 1: 7 confirmed findings (1 HIGH — the single-rule preset contract could not express the clock; 2 MEDIUM wall/contract gaps; receipts and column gaps), all folded — the preset contract became multi-rule, the class-1 wall gained the image-post rider, the S2 contract went async with `runAsUserId`, R2 landed at A1, the stripped-spend-ceiling correction propagated. Round 2: per-finding verification to convergence.

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
