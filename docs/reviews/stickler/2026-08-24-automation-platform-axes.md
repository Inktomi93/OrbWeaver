---
kind: review
status: draft
updated: 2026-08-24
---

# Automation as a PLATFORM — the born-whole audit of the three axes (+ the stale-claim lens)

> **Provenance.** Owner re-scope (bridge note 011, 2026-08-24, binding): "if we're launching
> automation we need to build it RIGHT the first time — it's not just a chat thing, it also needs
> to be able to touch each system and be extensible, because the plugin system we hope to allow
> people to contribute their own extensions as plugins." The constitution's get-it-right standard
> applied: **"not in v1" is legitimate only as UNWIRED (typed, refusing, handler pending — the
> born-whole posture), never as UNSHAPED (an axis needing a later migration).** This pass audits
> the three axes against that bar, designs the arms-through-the-registry extensibility shape, and
> carries the owner-ordered STALE-CLAIM lens (bridge note 012) as §4. The primary's
> "nothing-global-in-v1 ⇒ the pane stays placeholder" reading is RETRACTED by the re-scope; this
> doc's deltas supersede that line in the committed spec and the IA doc (flagged §5, not edited).
> One stickler verification round run to convergence.

## §1 AXIS 1 — SCOPE (chat-scoped ∧ owner-global, born whole)

**What the tree has today (receipts):**

- `automation_rules.chat_id` is **born nullable with the global meaning already documented**:
  "NULL = owner-global (BORN nullable, NOT wired v1 — v1 verbs refuse NULL; see header)"
  (`db/schema/automation.ts:73-76`; the file header at :6 names the owner-global reading).
- The verb wall: `createRule` requires a chat (`requireChatHost(ctx, principal, params.chatId)`,
  `verbs/create-rule.ts:15`) — the refusal is the wire, not the shape.
- **The dispatch pre-check ALREADY carries both branches**: `rulesInterested` forks
  `ctx.enabled.hasDomainRules()` (chat-spanning) vs `ctx.enabled.has(chatId)` (per-chat), and
  `loadEnabledDomainRules(ctx.db, triggerType)` loads ACROSS chats with no chat filter
  (`substrate/handle-event.ts:30-51`). Domain-triggered rules are chat-ANCHORED (the row still
  carries its chatId for arm targeting) but chat-SPANNING at match time — the global lane's
  dispatch shape is the domain lane's, already built.
- **What is NOT born (CORRECTED by the completed A-round, 2026-08-24 — this doc's earlier
  "the one place" framing was a STALE claim in our own work):** (a) `automation_budgets.chatId`
  is the PRIMARY KEY (`db/schema/automation.ts:133-136`) — a NULL-scope budget row is
  unrepresentable; (b) **the ENGINE seam is chat-typed throughout**: `runRule` explicitly SKIPS
  chat-less rules (`engine/dispatch.ts:239-242` — "v1 has no chat-less rule … defensive skip"),
  `DispatchFrame.chatId: ChatId` is non-null (`contract/ops.ts:246`), `AutomationCelEnv.chat` is
  non-optional (contracts:316-318; 11 arm-executor read sites), all five `AutomationBusEvent`
  members are chat-keyed, and `generate_image` is chat-required as built
  (`AutomationImageRequest.chatId: ChatId`, `contract/ops.ts:47` — imagery's own params are
  already nullable-ready, `domain/imagery/contract/params.ts:32`, so that widening is
  automation-internal). The dispatch PRE-CHECK carries both branches; the dispatch BODY does not.
  Consequence for §1.1-1.5: the global lane's build is admission + budget table + scope Record
  PLUS the engine nullable-seam (frame/env/bus/arm sites) — and if `AutomationCelEnv.chat` goes
  optional, every preset predicate needs `has(chat)` guards and the cel-goldens vector changes.

**Born-complete, concretely:**

1. **The scope axis is data, not a fork:** a rule is `chatId: ChatId | null`; NULL = owner-global.
   Admission: `createRule` accepts NULL under a `can(principal, …, global)`-class owner check (the
   D17 axes — no new gate kind); the enabled index gains an owner-keyed branch beside the two that
   exist.
2. **Arm scope-compatibility is a compile-pinned axis:** each `AUTOMATION_ACTION_TYPES` member
   declares `scope: "chat-required" | "chat-independent"` in ONE contracts Record (exhaustive —
   a new arm fails tsc until it declares). Validation refuses a chat-required arm
   (`surface_quick_reply`, `trigger_turn`, `set_chat_background`, `transform_draft`, and
   `generate_image` as built — the A-round correction) on a global rule with a typed refusal —
   the honest-arms doctrine at the verb tier. **†RULED THIS PASS — `insert_world_info_entry` IS
   legal on a global rule, gated by BOOK OWNERSHIP instead of chat attachment.** The receipts
   that decide it: the chat-attachment check exists because "the attachment IS the room's
   consent" (`arm-executors.ts:108-110`) — a consent gate for a ROOM-fired write; books are
   top-level single-owned (`world_books.ownerId` KEPT, D23 — `db/schema/world-info.ts:47-58`)
   and rooms consume books only through their own scope junctions. A GLOBAL rule's write is a
   LIBRARY write to the author's own book — ownership (fetchOwned) IS that consent — and no room
   inherits the content unless that room's own attachment says so (the junctions are untouched).
   Executor shape: branch on the frame's null chat — chat rule ⇒ attached-book check (as built);
   global rule ⇒ owner-owned-book check. Enforcer: the admission-matrix test row per mode.
3. **Global TRIGGER surface v1 = the DOMAIN bus only.** A global rule listening to CHAT-bus events
   would fan every chat event through the owner's global rules — a per-event scan the pre-check
   exists to avoid. The domain bus is already chat-spanning and cheap (`hasDomainRules`). The
   chat-bus global arm stays UNWIRED-but-typed (the trigger schema admits it; dispatch refuses
   with a typed not-yet) — unwired ≠ unshaped, per the bar.
4. **The budget home:** a sibling owner-keyed table (`automation_owner_budgets`, ownerId PK,
   maxFiresPerHour) — NOT a nullable-PK contortion on the per-chat table (SQLite PKs can't be
   NULL; a synthetic sentinel key is the D24 class). **Merge-window** (one baseline table).
   *(Rejected: reusing `global_variables`-style rows — budgets are engine-read hot-path config,
   not KV; rejected: no global budget — a runaway global rule multiplies by the owner's chat
   count, the exact hammering the belt exists to bound.)*
5. **Authority:** a global rule's standing authority is the AUTHOR THEMSELVES (owner-plane ops
   only, per point 2's arm axis) — `holdsAuthority`'s per-fire host re-check simply does not apply
   (there is no room); the analogue is `users.enabled` + the owner check at admission. No new
   permission kind (ruling 4 of the committed spec holds).

## §2 AXIS 2 — TRIGGER VOCABULARY (the tuple carries what the buses carry)

**Today (receipts):** `CHAT_TRIGGER_TYPES` = 15 members (`contracts/automation/index.ts:20-38`);
`DOMAIN_TRIGGER_TYPES` = 2 (`:42-47`). But the DOMAIN EVENT union has **FOUR** members —
`character.updated`, `asset.created`, `persona.updated`, `world-info.updated`
(`contracts/events/index.ts:31-37`, grew 2026-08-14 for the entity→room freshness bridge) — so
the trigger tuple is two members BEHIND its own source bus. (The re-scope note's "2 domain
triggers" is accurate about the TUPLE; the widening surface is these two unrepresented events.)

**Born-complete, concretely:** the tuple carries ALL FOUR domain events + (when B6 lands its bus
member) `reactionsChanged` on the chat side. Per-member coupled sites (all compile-pinned or
CHECK-derived): the tuple entry · the `LIVE_TRIGGERS` Record row (`:128-149`, tsc-forced) · the
`TriggerFact` optional field (`:264-299`) · **the paired bus↔type CHECK — tuple-derived DDL
(`db/schema/automation.ts:84-87,114` "the paired CHECK below binds bus ↔ type tuple"), so ANY
tuple widening is a generated-baseline edit = MERGE-WINDOW (#533/#534).** Consequence for the
path: **batch the whole widening into ONE merge window** — the four-domain-member catch-up +
`reactionsChanged` ride B6's already-scheduled baseline window (the committed spec's B6 row) or
the C1 state-table window, never five separate db-drops. The `crew.*`/`rpg.*` mirror grafts stay
exactly as the events header plans them (reserved re-adds if those domains return) — documented,
not tupled (an event that does not exist on any bus is not vocabulary, it is a wish).

## §3 AXIS 3 — THE ARM SURFACE + arms-through-the-registry (the plugin-critical shape)

**Today (receipts):** 8 arms (`contracts/automation/index.ts:160-169`) reaching
chat/world-info/notifications/imagery via the injected ops table (`contract/ops.ts:114-183`,
incl. the declared-generic `summarizeQuiet` at :176-182). A rule cannot touch characters,
presets, personas, tags, databank, gallery, workloads. Meanwhile plugin tools ALREADY register
into the ONE tool registry: `registerPluginTool` on the tool-use service
(`domain/tool-use/contract/service.ts:22`), wired at the membrane
(`entry/compose/automation-plugin.ts:315-322`, PL-A namespacing `plugin_<slug>_<name>`).

**The design: ONE bridge arm, `run_tool` — arms stay closed, extensibility rides the registry.**

- **Shape:** `{ type: "run_tool", name: string, argsTemplate: string (macro-rendered JSON),
  resultVar?: string }`.
- **Execute path:** the executor resolves `[name]` via `resolveTools` — at ARM RUN time an unknown
  name is `arm_error` errors-as-data, never the attach-throw (different consumer class); at MINT
  time `createRule` validation resolves the name and refuses unknowns (the boot-fatal posture
  moved to the mint — a rule referencing an uninstalled tool never stores). Executes via
  `executeToolCalls(set, batch, exec)` (`domain/tool-use/contract/service.ts:26`) with
  `exec = { principal: the author's resolved Principal, triggeredBy: authorUserId,
  chatId: frame.chatId (null on a global rule), turnId: null, roster: the author's membership
  (null on global), signal }` — `ToolExecutionContext` explicitly supports the non-chat consumer
  (`contract/params.ts:29-44`: chatId/turnId/roster all nullable-by-contract; a chat-scoped tool
  executing with null roster is "an errors-as-data denial, never a crash" — the contract's own
  words).
- **Gates, all existing:** the tool's `capability` ceiling under the author (`ToolCapability`,
  params.ts:24-26) + the owning verb's own gates + `holdsAuthority` per fire (chat rules) + the
  fire-rate budget + `run_tool ∈ SPEND_ARM_TYPES` (conservative: tools may spend; the F4
  invitation covers its refusals). Plugin-tool invocations additionally run the guest under the
  membrane's own per-call budget — the same bound as any tool call.
- **Result routing:** the fire log always; `resultVar` optionally writes a chat/global var through
  the EXISTING variable persistence (the arm 1.1 path) — **never prose** (the class-1 wall: no
  message write exists on the tool surface or the ops surface; the redline stands).
- **What this buys:** every builtin AND plugin tool becomes an automation action with ZERO further
  arm-surface growth — "plugins can extend what automation can DO" (the re-scope's exact ask)
  through the one registry's existing authority model. *(Rejected: arms-as-registry-tools
  wholesale — arms carry ENGINE semantics tools cannot (the env write-through ordering,
  `arm-executors.ts:90-95`; transform registration; budget spend classes); the closed union stays
  the engine's own verb set and the bridge arm is the merge, not a second system. Rejected:
  per-domain new arms for tags/databank/etc. as the growth strategy — each is a hand-wired ops
  row a third party can never add; domain REACH should arrive as registry TOOLS (each domain
  registers its automation-safe verbs as tools — the D48 shape), reachable via `run_tool`.)*
- **Costs:** 1 arm member + schema arm + executor + dry-run preview + `validate.ts` admission row
  (mint-time tool resolution) + the exact tuple pin (`tests/contracts/automation/
  index.contract.test.ts:125-133`, vitest) + the scope-axis Record entry (§1.2) + the
  `SPEND_ARM_TYPES` entry. Ordinary merge class (no schema).
- **The per-chat plugin-tool ATTACH question (turns, not rules)** stays the #24-gated seam the
  juice pass isolated (its finding 4): rules reach plugin tools via `run_tool` NOW-shaped;
  turn-attach needs the enablement-contribution design at plugin GA. Two different doors, one
  registry.

## §4 THE STALE-CLAIM AUDIT (bridge note 012 — the corpus lens)

Method: every load-bearing "the tree is X" claim in the committed spec, the IA doc, the juice
doc, and this pass was re-derived against the CURRENT tree (the committed spec and IA doc had
been receipt-verified by the 08-24 panel and placement rounds, so their residual risk set is
doc-sourced claims and negatives; the juice doc's receipts were re-verified by the ORCHESTRATOR
from the partial A-lens transcript evidence plus its own probes — the four A-lens agents died to
API 529s before reporting, so no completed independent A round exists; the juice doc §3 rows 1-7
and 22-23 record the recovered evidence and its provenance honestly). Classification:
CONFIRMED / STALE / UNVERIFIABLE.

**Claims checked: 41 load-bearing (32 committed-spec receipts re-verified by the panel round +
this pass's own 9). STALE found: 6 (rate ≈ 15% when doc-sourced claims are the denominator —
every stale one was sourced from a DOC or an in-code COMMENT, zero from code-behavior reads).**

| # | Claim | Verdict | Receipts |
| - | - | - | - |
| S1 | "the portability core is clean but import never joined it" (pain inventory §7, asserted to the owner) | **STALE** (the primary's own exemplar) | `contracts/portability/index.ts:39` `PORTABLE_IMPORT_ORDER` + 8 domain `contract/portability.ts` modules on tree; residue (ST bulk path) half-dissolved by D117 |
| S2 | "plugin is reserved — nothing plugin-shaped is built now" (`tool-use/contract/params.ts:20`, IN-CODE comment) | **STALE — the most consequential in-code one**: `registerPluginTool` sits TWO LINES below on the same contract (`service.ts:22`) and is wired at `entry/compose/automation-plugin.ts:315-322`. A builder trusting the comment re-designs plugin registration that exists | code vs its own comment |
| S3 | tool-use README triage "T5 rides buddy · T6 lands with crew CW2" | **STALE** (dead consumers — buddy/crew purged); the committed spec already corrected it ("consumers dead") | README:19 vs the spec's tool-use finish-line |
| S4 | "rules are chat-scoped" as the committed spec's flat framing (§3-S3) | **STALE-AS-NARROWING — the top-line finding**: true of v1 verb behavior, but the schema declares owner-global BORN (`db/schema/automation.ts:73-76`) and the dispatch pre-check already carries the chat-spanning branch (`handle-event.ts:30-51`). This narrowing FED a design decision (the retracted "nothing global v1 ⇒ placeholder pane"); the re-scope is its correction, and this doc is the vehicle | both receipts in §1 |
| S5 | "2 domain triggers" as the platform gap's size | **STALE-AS-UNDERCOUNT**: the tuple has 2, but the source bus has 4 — the gap is 2 unrepresented LIVE events, cheaper than the note implies | §2 receipts |
| S6 | rpg-design/13 GRADUATED banner · PD-17 built-tense narrative · D61 "safeFetch not yet built" · INDEX crew disposition | **STALE** (the note's four given instances, confirmed pattern: docs asserting build-state in a tense that outlives truth; 13's rider is the model repair) | given + rider on tree |
| — | The committed spec's 32 panel receipts · the IA doc's as-built strip/anchors/registries · the juice doc's arm/membrane/tag/databank receipts (per A1) · this doc's §1-§3 receipts | **CONFIRMED** current | the respective verification rounds |

**The corpus rule this audit earns (recommend promoting into Documentation-Law):** a doc may
state WHAT a thing is; it may not state THAT a thing is built/unbuilt without a dated receipt —
build-state claims rot, and every stale claim found was a build-state tense, none a shape claim.

## §5 THE ONE RECONCILED SPEC-DELTA LIST (this section supersedes the earlier §5 and the juice doc's scattered deltas; ordered by build sequence; the juice doc §4 points here)

> Already LANDED, verified, dropped from pending: the cadence `int()` coercion (primary's
> f9e325ef6 — all three sites patched correctly).

1. **S3 preset shape:** presets mint rule SETS; knobs substitute at mint; **counter rules set an
   explicit high `maxFiresPerHour`** (the 30/hr per-rule default freezes any per-message counter —
   the committed "clock fires when full" preset carries this bug today); TWO preset-authoring
   LAWS: every `vars` read in a predicate is `has()`-guarded (absent-key access THROWS in the
   shipped dialect), and chip sendTemplates are diegetic or compose-mode (never member-attributed
   director voice).
2. **The `surface_quick_reply` arm gains a per-choice `mode: "send" | "compose"`** (schema + bus
   payload + S1 descriptor consumption) — without it the send/compose axis is a per-chat game
   knob and the diegetic-chips law has no lever; **the S1 mount gains a chips display cap +
   overflow** (per-arm `max(4)` does not bound multiple rules on one event) and the
   one-visible-card + conservative-defaults attention-budget note.
3. **A `cel-goldens` vector pinning the shipped dialect's rules:** mixed-type arithmetic throws
   (`int()` coercion mandatory), absent-key access throws (`has()` guards), no inline-flag
   regex (`.contains`/`.lowerAscii().contains` are the sanctioned forms).
4. **`run_analysis`'s output-op union gains `setVariable`** (numeric-score value contract — the
   first model-authored write into the vars plane) **and the chat-vars READ surface is priced
   with it** (no transport/client read exists today; the committed B9 widget shares the need).
   The score-publication preset itself is a NEEDS-OWNER fork (F6's line) with a stated
   ships-OFF default.
5. **The trigger-vocabulary catch-up, batched into ONE merge window** (with B6's
   `reactionsChanged`): +`persona.updated`, +`world-info.updated` (live on the domain bus,
   unrepresented in the tuple), + the `TriggerFact.character.contentChanged` field the resolver
   currently drops (`fact-resolver.ts:120-122`).
6. **`run_tool` joins the arm surface** (§3; ordinary merge) with the pause-not-rot posture for
   rules naming deactivated plugin tools (an `arm_error` today counts toward the 20-consecutive
   auto-disable).
7. **The scope axis born complete** (§1 as CORRECTED): NULL-chat admission + the owner-budget
   table (**merge-window**) + the arm scope Record (incl. `generate_image` chat-required as
   built; `insert_world_info_entry` global-legal under the ownership gate per the §1.2 ruling) +
   the engine nullable-seam; the `automation` settings pane is the global lane's home (the IA
   Δ2 placeholder line RETRACTED).
8. **The third `NOTIFICATION_RECIPIENTS` member** (actor-excluding) with its four named code
   sites (tuple+zod; resolver; the `arm-executors.ts:160` ternary → exhaustive dispatch; the
   plugin membrane's silent-downgrade line + guest-visible vocabulary sites). Not a merge window.
9. **Cross-system suggestion routes use the target domain's own pending-status where one exists**
   (the `character_tags.status` precedent) — an S4 scope note.
10. **#24-review items, listed once:** `llm.quiet` (+ its two vitest exact pins); the plugin-tool
    per-turn attach seam; the plugin egress rate floor (event delivery has NO hourly belt);
    `neutralizeMacros` on plugin world-info writes; plugin suggest (`chat.suggest`).

## §6 What stays unwired-but-typed (the honest v1 line, restated)

The global CHAT-bus trigger arm (§1.3) · the `crew.*`/`rpg.*` event mirrors (§2) · the per-chat
plugin-tool turn-attach seam (§3, #24) · the world-info-on-global-rules legality call (§1.2†).
Each is TYPED (schema/tuple/contract admits it) and REFUSES (typed error naming the graft) —
unwired, never unshaped.

## §7 PROPOSED Documentation-Law text (ready to land; from the §4 audit's earned rule)

> **Build-state claims carry a dated receipt or do not exist.** A doc may state WHAT a thing is —
> its shape, home, contract, or law. It may state THAT a thing is BUILT, UNBUILT, WIRED, PURGED,
> or CONSUMED only with a dated, path-anchored receipt (`path:line`, a commit sha, or `git show`
> output — dated, so a reader knows WHEN the tense was true). An undated build-state sentence is
> a review defect in new docs; in existing docs it is read as UNVERIFIED and re-derived before
> anything is built on it. In-code comments are docs under this rule (the `tool-use/contract/
> params.ts:20` "plugin is reserved" comment sat two lines above the built `registerPluginTool`).
> *(Minted from the 2026-08-24 stale-claim audit: nine stale claims found across two passes —
> every one a build-state tense sourced from a doc or a comment, zero from code-behavior reads.)*
