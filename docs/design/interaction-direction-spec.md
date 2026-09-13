---
kind: design
status: active
updated: 2026-08-30
---

# THE INTERACTION DIRECTION — the one specification (substrate · platform · path · catalogue)

> **THE ONE DOC.** Everything the interactive-story direction decided lives HERE: the taxonomy,
> the authority law, the S1–S5 substrate, the automation PLATFORM axes (scope · triggers ·
> `run_tool`), the complete build path with homes, the preset catalogue, the authoring laws, the
> rulings, and the honest unknowns. A builder lands any row from this document alone. The four
> review documents under `docs/reviews/stickler/2026-08-24-*` are PROVENANCE — the arguments,
> panels, and adjudications behind these conclusions — and are never required reading (§10).
> Conclusions here carry their WHY + rejected alternative where a builder might re-litigate;
> every load-bearing tree claim carries a `path:line` or `legacy-main:` receipt. Where an earlier
> revision of this spec conflicts with this one, THIS one folds the later-verified correction and
> says so in place.

## §1 The direction, and the taxonomy that is the spine

**The direction.** Orbweaver's rooms become interactive stories: the model can offer choices, the
room can talk back (chips, cards, reactions), background intelligence maintains lore, pacing,
images and state — all WITHOUT new room actors, without a second execution system, and with every
piece landing alone, owner-testable, byte-identical when off.

**The taxonomy (owner-articulated, binding).** Background AI splits by its relationship to canon:

- **CLASS 1 — OUTSIDE the room.** Reacts, NEVER speaks. Side effects only: lore writes, state
  writes, suggestions, backgrounds, images, notifications, quiet analysis. Its path to PROSE
  canon is ASKING THE PIPELINE for a turn (`trigger_turn` → the guided request,
  `entry/compose/automation-plugin.ts:112-115`, into the one turn pipeline with the D19 triple
  stamped at `domain/chat/verbs/turn.ts:2496-2498`).
  **Two precisely-bounded riders on this wall, both BUILT law:** (1) the `generate_image` arm's
  non-quiet default POSTS the generated image as a message through chat's ONE image-post seam
  (`postNarratorMessage`), depth-stamped and `initiator:"automation"`-attributed
  (`domain/automation/contract/ops.ts:66-70`, `:51-56`) — attributed MEDIA, never model prose;
  (2) `transform_draft` rewrites a MEMBER's outgoing draft pre-commit (`PROMPT_TRANSFORM_POINTS`
  first point `user_input` — "after the macro pass, before USER_INPUT regex", `contracts/chat/
  bus.ts:199-201`) — a host-authored template touching prose canon WITHOUT a turn, attributed to
  the human whose draft it is; it bypasses the ops surface (the dispatch engine REFUSES it,
  `arm-executors.ts:302`) and registers into chat's D50 pipeline.
  **The wall as law: no text/prose message-insert op exists on the arm surface or the plugin
  membrane, and none may be added** (`AutomationOps` at `domain/automation/contract/ops.ts:
  114-183`; `PluginHostV1` — read/variables/quick-reply/requestTurn/worldInfo/storage, no message
  write, `contracts/plugin/host-v1.ts:81-119`). ENFORCER, honestly tiered: the op-type contract
  (compile) stops CALLING a nonexistent op; ADDING one is a review-tier redline — the recorded
  gate option (unbuilt) is an `AutomationOps` surface allowlist in the `bus-payload-allowlist`
  gate shape.
- **CLASS 2 — INSIDE the room.** Contributes to canon, ALWAYS attributed. SEQUENTIAL = a turn
  slot via arbitration (the chat lock, the one pipeline; every message/variant carries author
  identity; the D137 cast producer resolves every referenced identity). Any future in-room agent
  is class-2-sequential = a seat + attribution = **exactly parked #13, nothing less**.
  CONCURRENT = alongside a turn without a slot: the D109 state round is the pattern exemplar;
  reactions are the human-and-character concurrent form (canon junction rows attributed to a
  participant seat, no turn, no lock); a character's `react` tool DURING a turn (B7) is
  class-2-concurrent — which is why it needs the tool-attach seam (§6 R2): today NO registry
  tool can attach to any chat turn (`turn.ts:627` `attachedToolNames: rpg?.tools ?? []` is the
  only source; rpg pins `tools: []` every mode — D109-1, `domain/rpg/chat-ops/gather.ts:201,207`).

Every path row (§7) and preset (§4) is tagged with its class. Nothing in this spec creates a
class-2-sequential actor.

## §2 The authority law + THE AUTHORING LAWS

**All authority is HUMAN authority in the one kernel.** A feature may CITE an existing axis; it
may never invent one. The axes and their one homes: `can()` (D121) · the D19 triple
(`Principal.userId` = authenticated caller; `triggeredBy` = the human responsible —
spend/abort/attribution; `runAsUserId` = the host whose creds fund — `Core-Path-Registry.md:51`)
· D17 (hosted creds owner-only; non-owner use needs explicit consent, fail-closed; `:47`) ·
automation fire-rate budgets + the cascade depth cap · plugin grants (a projection onto
`can()`/`fetchOwned`/D17 — never a parallel kernel) · the tool `capability` ceiling + owning-verb
gates. **Vocabulary split, review-enforced:** *permission* = human-side; *capability* = wire-side
(`ModelCapability.tools`, `output.structured`). **Personas are FACES** (zero permission surface,
ever). **Characters are CONTENT** (authority held OVER them — ownership; roster characters are
host-owned by construction, `chat/verbs/roster.ts:521-527` — never OF them).

**Automation's standing identity:** a rule acts as its AUTHOR (`authorUserId = rule.ownerId`,
`engine/dispatch.ts:159`, threaded through every arm executor), re-proven per fire by
`holdsAuthority` (`dispatch.ts:117-128`); rules are host-authored (`createRule` is
`requireChatHost`-gated, `verbs/create-rule.ts:15`). `trigger_turn` stamps
`triggeredBy = the author (the funder)`, `runAsUserId = the host box` (`turn.ts:2496-2498`), with
the D17 consent wall and the rate budget INSIDE the turn pipeline.

**THE AUTHORING LAWS (first-class; every preset and every arm template obeys them):**

1. **`has()`-guard every maybe-unset `vars` read in a predicate.** `int(vars.absent)` THROWS
   ("No such key") in the shipped dialect — probed live, twice. Spelling:
   `!has(vars.x) || int(vars.x) …`.
2. **`int()`-coerce mixed arithmetic.** `chat.messageCount % N`, `now.epochMs - int(...)` and
   kin THROW (`no such overload: dyn<double> % int`) without coercion:
   `int(chat.messageCount) % N == 0` · `int(now.epochMs) - int(vars.t) > N`. A committed
   **`cel-goldens` vector** pins these dialect rules (coercion, absent-key throw, `has()`, and:
   no inline-flag regex — `.matches("(?i)…")` fails; `.contains` / `.lowerAscii().contains` /
   `startsWith` / `size()` are the sanctioned content-match forms).
3. **Chip text is diegetic or compose-mode, never member-attributed director voice.** A chip
   click sends as the CLICKING member — its sendTemplate must be words that member would say
   (a vote pick), or the chip uses compose mode (a seed the member owns and edits). Director
   asks ("recap", "bring her in") ride invitations/cards or steer — never a member's line.
4. **Counter rules set an explicit high `maxFiresPerHour`.** The per-rule default is 30/hr
   (`db/schema/automation.ts:51`) and an active RP hour exceeds it — an uncapped per-message
   counter freezes stale mid-session.
5. **The one-visible-card attention budget.** The S1 mount shows ONE card (newest of either S4
   class; a mono "+N pending" discloses the rest) and caps the chips row with overflow (the
   per-arm `max(4)` does not bound multiple rules on one event). Preset DEFAULTS are
   conservative: confirm-first and analysis presets ship OFF; the owner enables per room.
6. **Machine-authored injection content is macro-inert.** Stored guidance is DATA delivered
   VERBATIM — never through `renderArmTemplate`/`processMacros` (a model-authored
   `{{getglobalvar::…}}` reaches the prompt as literal braces; pinned test). The splice's
   `resolveContent` hook is identity in production (`assembly/injections.ts:125-131`, no live
   supplier) and stays identity for this channel.
7. **`neutralizeMacros` on model- or plugin-authored text entering a macro-EXECUTION plane.**
   World-info content is fully macro-rendered at assembly with a persisted op-log
   (`assembly/context.ts:225`; `engine/engine.ts:249`) while message rows are not — every
   model→lore route (C2, rumor mill) and plugin→lore write applies the house primitive
   (`kit/macro/content.ts:19`) at the write boundary.

## §3 The substrate — S1–S5 + the platform arm surface, final form

### S1 — the in-chat control seam (client)

ONE registry + behavior contract for TRANSIENT interactive controls near the transcript/composer,
generalizing the click/consume contract `choice-send-provider.tsx` already spells (own
`useSendMessage`, busy from shared turn phase, per-chat compose default). The `:::choices` fence
renderer STAYS in the content pipeline (canon plane, D110-1 `DIRECTIVE_FENCE_NAMES`); reaction
pills are NOT S1 (persistent canon at `message-footer`).

- HOME: control-kind union + descriptors at the chat feature's composition tier; wire payloads in
  `@orb/contracts/automation`. **The mount is ONE `above-composer` `ChatSurfaceContribution`**
  (`CHAT_SURFACE_ANCHORS`, `packages/client/src/lib/contribution-contracts.ts:27`) consuming the
  registry — zero controls ⇒ renders nothing ⇒ byte-identical (the seam's own M8 property).
- Consumption axis `"send" | "compose" | "execute"`, busy PER MODE: send = turn-phase-disabled
  with the reason on title; compose = never disabled; execute = disabled only while its own
  mutation is pending (a confirmed action is a front-door verb call, not a turn).
- **The `surface_quick_reply` arm gains a per-choice `mode: "send" | "compose"`** (today the arm
  is `{label, sendTemplate}` only, `contracts/automation/index.ts:215-221`, and send-vs-compose
  is a per-chat game knob — `choice-send-provider.tsx:41-52`; without the field the diegetic-chip
  law has no lever). Schema + bus payload + descriptor consumption, priced once, consumed by the
  catalogue.
- Stacking: cards above chips; ONE visible card + "+N pending"; chips one row with a display cap
  - overflow (law 5). Cards use neutral/outline buttons + a hairline accent border — the
    composer Send is CONTENT's one `primary` (UI §4.3 rule 3); every card carries an explicit
    dismiss. ENFORCER: compile (`CONTROL_KINDS` + exhaustive Record); CT mount matrix; honestly
    review-tier on future bolt-ons (the one-mount chokepoint is the review surface).
- Legacy design law adopted: **the ASK is transient (S1); the RESULT is canon** — a
  `ToolCallRecord` chip on the variant, rendered via the `tool-renderers` door registry
  (`compose/authed-app.tsx:144`); unknown tools render the generic `ToolCallBlock` fallback
  (`contribution-contracts.ts:94-103`).
- Merge class: ordinary.

### S2 — the model-teaching seam (server)

ONE per-chat assembly of "what this chat's model is told it can do," collected from registered
contributions, delivered on the existing injections merge. **The contract, frozen at A1:** a
`TeachingContribution` is `{ id, order, collect(tctx) → Promise<{ injections: ChatInjection[],
toolNames: readonly string[] }> }` registered at `entry/compose`; `tctx` carries `{ chatId,
runAsUserId (the resolved host — at the collection site already, turn.ts:599),
knobs: { offerChoices: boolean } (the resolved per-chat knob reads — ONE field at A1, B1's knob;
grows ADDITIVELY, one named field per contribution that needs one),
rpgGather: ChatRpgGatherResult | null }`. The collection call sits in chat's
`buildTurnContext` AFTER `ctx.rpg.gatherTurnContext(...)` (`turn.ts:560-577`); **rpg is
contributor #0, a pure projection** `tctx.rpgGather?.injections ?? []` with `toolNames: []` —
content and order byte-unchanged; the gather's non-injection outputs (`macros`/`tools`/
`terminalTools`/`cardKeepLastX`/`celBindings`, `domain/chat/contract/context.ts:526-547`) stay on
`ctx.rpg` untouched.

- **The `toolNames` axis IS the tool-attach seam** (teach and attach travel together — the rpg
  gather's own shape generalized): `attachedToolNames` becomes the union of contributions'
  `toolNames` (today always `[]` — byte-identical; B7's `react` tool is the first non-empty
  contributor). Capability honesty gates per turn (`tools_unsupported` drop,
  `engine/pipeline.ts:676,685-692`). Pins: a contribution's declared names resolve at
  REGISTRATION (boot-fatal — `resolveTools` THROWS on unknown names at attach,
  `domain/tool-use/contract/errors.ts:3-4`); attach is capability-wire-gated only, AUTHORITY runs
  at execute (the ceiling + verb gates under the turn principal; `resolveTools` takes no
  Principal by design, `contract/service.ts:24`).
- Teach TEXT stays in `PROSE_SLOTS` (`RPG_CYOA_TEACH = PROSE_SLOTS["rpg.reminder.cyoaTeach"]
  .text`, `domain/rpg/substrate/reminder.ts:126` — preset-editable, baseline-pinned). NO second
  prose home; `reminder.ts` never moves (it is the ONE home of the state-line grammar, macro-view
  coupled, reachability-pinned).
- The per-domain module `domain/<x>/teaching-contribution.ts` is a NEW feature-root slot that
  must be RATIFIED the D117 way, priced into A1: the `feature-structure` gate reds unlisted root
  files (`ALWAYS_ALLOWED_ROOT_FILES`, `tooling/src/verify/gates/feature-structure.ts:32` — probe
  went RED), so A1 carries the allowlist entry + the dep-cruiser `pathNot` + a D-entry.
- ENFORCER: TWO byte-identity pins — the INSTRUMENT is the merged `ChatInjection[]` handed to
  assembly (the injections-merge output; deep-equal over the array, per mode × cyoa state; a
  zero-contribution chat's array identical to today's) — + the double-teach guard as an
  assembled-output assert (exactly ONE choices-teach injection when both the game cyoa knob and
  the chat offer-choices knob are on) + the
  convergence law (all prose steering on the ONE ChatInjection channel; PD-63 one-placement) +
  the attach-matrix pin + a dep-cruiser stanza (contributions importable only by compose) —
  lint + review, honestly not package physics. Merge class: ordinary; behavior-frozen by the pins.

### S3 — rule presets as data + THE SCOPE AXIS (server)

**A preset mints an ordered RULE SET, not exactly one rule** (a rule's predicate gates the whole
rule before any arm and no arm carries a per-arm condition — `contracts/automation/index.ts:
189-247`; counter-then-threshold shapes need TWO rules, same-batch-safe via the env write-through
`arm-executors.ts:90-95`): `RulePresetDef = { id, title, rules: readonly { triggerType,
predicate (CEL constant), arms }[], knobs, confirmFirst? }`, titled `<preset title> (i/n)` for
n>1, each rule minted through the EXISTING `createRule` validation. Knobs SUBSTITUTE AT MINT into
the CEL sources as literals. Pure turn cadence needs no counter: `int(chat.messageCount) % N == 0`
(`chat.messageCount` is an env binding, contracts:317; the `int()` is mandatory — law 2).
HOME: `domain/automation/contract/presets.ts` + `verbs/create-rule-from-preset.ts`; the id tuple
AND the client-visible projection (id/title/knob descriptors) in `@orb/contracts/automation`
(CEL sources and handlers stay domain-side). ENFORCER: exhaustive
`Record<RulePresetId, RulePresetDef>` (arms typed against the action union); per-preset
create→fire int test through the real engine. v1 knob-edit path: re-mint from the picker; the
post-mint knob-editing flip shape — provenance on `automation_rules` — LANDED with B10's rules
rider (2026-08-29, columns spelled `rule_preset_id` + `rule_preset_knobs` per the 2026-08-24
Rule-prefixed vocabulary ruling): stamped by `createRuleFromPreset` with the COMPLETE resolved bag,
CLEARED by `updateRule`, projected on `RuleView` (the saved-roster capture reads it; the in-place knob
EDITOR over it stays unbuilt — edit is still re-mint). As-built record:
`../history/design/saved-rosters-build-record.md` §6.

**THE SCOPE AXIS, born whole (the platform ruling — bridge 011; "not in v1" only ever means
UNWIRED-but-typed, never unshaped):**

- A rule is `chatId: ChatId | null`; NULL = **owner-global**. The schema is born
  (`automation_rules.chat_id` nullable with the global meaning documented,
  `db/schema/automation.ts:73-76`) and the dispatch PRE-CHECK carries both branches
  (`substrate/handle-event.ts:30-51`) — **but the engine BODY is chat-typed and must widen**:
  `runRule` skips chat-less rules (`dispatch.ts:239-242`), `DispatchFrame.chatId` and
  `AutomationCelEnv.chat` are non-nullable (11 arm-executor read sites), the bus members are
  chat-keyed, and `generate_image` is chat-required as built (`AutomationImageRequest.chatId:
  ChatId`, `ops.ts:47` — imagery's own params are nullable-ready, `domain/imagery/contract/
  params.ts:32`). If `CelEnv.chat` goes optional, preset predicates gain `has(chat)` guards and
  the cel-goldens vector changes.
- **Arm scope-compatibility is ONE compile-pinned contracts Record** — each arm declares
  `scope: "chat-required" | "chat-independent"`; chat-required as built: `surface_quick_reply`,
  `trigger_turn`, `set_chat_background`, `transform_draft`, `generate_image` — **and C5 FLIPS
  `generate_image` to chat-independent as part of its landing** (the Record entry + widening
  `AutomationImageRequest.chatId` to nullable, `ops.ts:47` — imagery's own `chatId?` is already
  nullable-ready — so the living-library preset is admissible; without this flip C5's admission
  matrix would refuse C5's own showcase).
- **RULED — the chat-less CEL env:** `AutomationCelEnv.chat` (and `vars`/`choice`, both
  chat-keyed) stay REQUIRED and untouched; a GLOBAL rule's predicate may not reference them —
  REFUSED AT MINT (validation walks the parsed CEL for the chat-keyed roots; global predicates
  use `event`/`global`/`now` only). WHY: every existing preset predicate stays valid, zero
  `has(chat)` churn, the cel-goldens vector is unchanged, and the global lane's facts are domain
  events whose predicates naturally need only event/global/now. *(Rejected: optional `chat` —
  churns every predicate and the goldens for a lane that doesn't read chat state.)* **RULED:
  `insert_world_info_entry` is global-LEGAL under a BOOK-OWNERSHIP gate** — the chat-attachment
  check is a ROOM-consent gate ("the attachment IS the room's consent", `arm-executors.ts:
  108-110`); books are owner-owned (`world_books.ownerId` KEPT, D23, `db/schema/world-info.ts:
  47-58`); a global rule's write is a LIBRARY write to the author's own book, and rooms consume
  only through their own scope junctions (untouched). Executor branches on the frame's null chat:
  chat rule ⇒ attached-book check; global rule ⇒ owner-owned-book check; admission-matrix test
  per mode.
- Global TRIGGER surface v1 = the DOMAIN bus only (chat-spanning and cheap via `hasDomainRules`);
  the chat-bus global arm stays typed-and-refusing. Authority: the author themselves
  (`users.enabled` + an owner check at admission; `holdsAuthority` has no room to check). Budget:
  a sibling owner-keyed table (`automation_owner_budgets` — the per-chat table's PK is chatId,
  a NULL-scope row unrepresentable) — **merge-window**. The global lane's HOME: the `automation`
  settings pane (today `placeholder: true` — it becomes the owner-global rules surface: list +
  picker + the owner budget).

### S4 — suggest/confirm (server + S1 card)

The #14 three-posture law over rules (plugins join post-#24): standing authority ⇒ act directly;
no standing authority ⇒ a SUGGESTION the HOST confirms; structured-output-only ⇒ no tools
(D109-4). The fourth-posture redline: direct execution without standing authority never exists.

**TWO suggestion classes:**

1. **Confirm-first cards** (`confirmFirst` presets/rules): at fire time, after predicate and env,
   the arm STASHES `{ suggestionId, chatId, ruleId, summary, resolvedArm }` — the summary the
   host reads and the arm that executes in ONE record (the buddy `Proposal` shape); a REWRITE
   card (C3) also carries the audited `variantId` + content hash (the legacy stale-accept guard,
   `legacy-main:packages/server/src/domain/crew/verbs/proposals.ts` — refuse
   `superseded`/`stale` without touching canon). `confirm(suggestionId)` CLAIMS — id-match,
   take-once, delete-on-take (`legacy-main:.../buddy/agency/proposals.ts:40-47`) — re-checks
   rule-enabled + `holdsAuthority(author)` + (rewrites) variant-still-selected + hash, then
   executes the STORED arm. Double-clicks and replace-races refuse typed, never double-execute.
2. **Rate-refusal invitations** (RULED F4, ON by default for spend arms — and per-rule OPT-OUTABLE since
   2026-08-29, #804: `automation_rules.suggest_on_refusal`, the host's standing answer, ANDed with the
   arm-shape derivation at the raise gate): `budget_refused` fires
   BEFORE predicate and env (`dispatch.ts:181-195`) so no arm can render there — the invitation
   carries the RULE REFERENCE only ("rate-capped — run it now?"); confirm = a fresh host run of
   that rule via R7 `runRuleNow`. No stored payload, no TOCTOU by construction. The
   machine-readable spend set is the NEW `SPEND_ARM_TYPES` contracts tuple (`trigger_turn`,
   `generate_image`, `run_analysis`, `run_tool` — today only comments mark them).

**Identity at confirm:** the executed frame's `authorUserId` STAYS the RULE AUTHOR (ownership,
funding, state namespace — every executor keys off it); the CONFIRMER is the AUTHORIZER only
(host-gated, stamped on the fire row). Confirm re-runs `holdsAuthority(author)`.
**RULED (owner): VOID THEM ALL on host handoff** — authority died, its pending asks die with it;
rules stop firing and a re-fire under the new host mints fresh suggestions (the
offer-orphans-to-the-new-host arm is the recorded rejection).

- Storage: in-RAM pending map, TTL, replace-per-kind within class 1 keyed `(chatId, ruleId)` —
  RULED F1 (the buddy-proven shape; bounded per chat by rule count; the TTL sweep carried
  explicitly; respawn wipes accepted). The durable-row alternative is recorded (§6 R5).
- Fire-log honesty: `AUTOMATION_FIRE_OUTCOMES` has NO suggestion terminal; adding one is a
  merge-window CHECK edit (§6 R5, unbuilt-recorded). v1 writes no fire row at suggest time; the
  CONFIRMED execution records `fired`, stamped with the confirmer (recording lives in dispatch —
  the confirm verb writes its own row).
- Bus: TWO host-only `AutomationBusEvent` members + belt + coverage sites; NO transport edit
  (the member filter is default-deny — `stream/sources/automation.ts:38,58`). `suggestionRaised` is
  the ask; `suggestionResolved` (added 2026-08-25, #700 — the one-line delta to this bullet's
  original "one NEW member") is its RETIREMENT twin, emitted at the confirm CLAIM (before any
  re-check, so a refused confirm retires too) and the dismiss DROP so an answered card leaves EVERY
  attached host tab — not just the acting one, which also retires optimistically via the mutation's
  per-call `onSuccess`. Without the retire member the host's OTHER tab/device held the dead card until
  TTL (30 min): no query, no replay on this live-only room, and as the band's `cards.at(-1)` it masked
  every older pending card behind a lying "+N pending". The client exhaustive total map over
  `AutomationBusEvent` + deleting the `SERVER_INTERNAL_REACH` exemption row
  (`bus-definition-belts.ts:75-76,232-234`) land with the FIRST client consumer.
- Cross-system scope note: suggestion routes whose confirm surface lives OUTSIDE the room use the
  target domain's own pending-status where one exists (the precedent: `character_tags.status`
  pending/accepted with CHECK, `db/schema/tag.ts:118-125`; chat-tags carry no status).
- ENFORCER: compile (the suggestible-arm summary Record + the SPEND tuple); the authority matrix
  test (non-host refused; disabled rule voids pending; take-once; stale rewrite refused;
  author-lost-host refused).

### S5 — the quiet-analysis arm `run_analysis` (class 1; the honest director carrier)

What the legacy crew director actually computed, recovered from code and carried as semantics
(never ported): durable per-chat plot state (arc + twist bank + retiredTwists + guidance +
watermark — `legacy-main:.../crew/contract/director.ts`); a think-first structured pass per
cadence over transcript + plot + host steer; twist ops (retire-before-add, `TWIST_CAP`, dedup);
ONE narrator-facing guidance instruction — "plant, foreshadow, or complicate"; **steers the
NARRATOR's choices, never the players'** (`legacy-main:.../crew/members/director.ts`, the
validation main-era D93 records).

1. **The arm:** rule fires → a QUIET schema-constrained pass over `{ the window (per-route,
   point 5), the arm's stored STATE, the host's steer knob }` → `{ stateOps, guidance,
   suggestions[], vars? }` → the executor routes each output class. **The model lane:** the
   existing `summarizeQuiet` op WIDENED into the generic quiet-LLM op its header declares
   (`contract/ops.ts:176-182`), gaining a structured variant on the AUTHOR's own role-resolved
   connection (`bindRoleClients(authorUserId)`, the autobg precedent, `entry/compose/
   automation-plugin.ts:183-189`) routed to the `structured` role (D109-4; its firewall row
   excludes the metered sub — `infra/providers/roles/firewall.ts:24,46-48` — hosted-cred
   laundering structurally closed). WHY author-scoped rather than D109-2 turn-inheritance: an
   automation arm is the author's standing side generation (it can fire with no committed turn —
   `runRuleNow`); the author funds their own call under their own consent; no by-proxy triple
   exists. *(Rejected: a bare `runStructuredTurn` import into automation — a second quiet-LLM
   path beside the declared-generic op.)* SPEND-classed.
2. **State home: the `automation_rule_state` table** — `ruleId` (FK `automation_rules` CASCADE,
   UNIQUE) · `state` JSON (analysis state AND the C2 high-water mark) · `guidance` TEXT (capped
   `ANALYSIS_GUIDANCE_MAX`, sliced at the write boundary) · `updatedAt`. Authority derives
   ruleId → rule (ownerId, chatId) — D23-clean, cascade-clean, NO member or plugin read surface.
   *(Rejected: the author's global variables — no FK, a D24 soft-ref no gate sees, and the
   plugin `global_vars` capability is a member-egress-capable second reader.)* NOT swipe-folded
   (matching legacy `crew_plots` semantics). **Merge class: MERGE-WINDOW** (one baseline table).
3. **Guidance delivery: an S2 teaching contribution registered by automation** — reads the
   rule-state row of the chat's enabled analysis rule whose author still holds host, emits ONE
   ephemeral `in_chat` system injection at the authors-note register. Guidance is DATA, macro-
   inert (law 6). Byte-identity: no guidance ⇒ `[]`. Host-handoff: fires stop
   (`holdsAuthority`) and the read yields `[]` — fail-safe both directions; the ex-host's row
   ages with its rule.
4. **Output routes (the closed union, exhaustively-Record'd — a new class fails tsc):**
   `setState` (the rule-state write) · `steer` (the guidance slot) · `upsertLoreEntry` (the
   existing world-info op; span-stamped idempotent titles, the keeper discipline; law 7) ·
   `suggest` (an S4 card) · **`setVariable`** (chat vars via the op the `set_variable` arm rides;
   NUMERIC-SCORE value contract, capped — the first model-authored write into the vars plane).
   Per-class `apply: "direct" | "confirm"` is preset-set. **The vars READ surface prices with
   `setVariable`** — one-line contract: `chat.getRuntimeVariables(chatId) → Record<string,
   string>`, MEMBER-gated (the membership floor; the vars plane is member-visible by design),
   invalidated by the existing turn-commit/swipe chat-bus events; no transport/client read
   exists today (the sole reader is the plugin membrane's `getVariables`). **Built by WHICHEVER
   of B9 or C1 lands first** — B9's row consumes it and may build it.
5. **Read windows per route:** STEER reads the FRESH selected-lineage tip (the legacy director's
   deliberate posture); DURABLE-WRITE routes read a SETTLED span behind a protect tail, tracked
   by the high-water mark in the rule-state row, advanced ONLY on successful apply (the legacy
   retryability contract — `legacy-main:.../crew/substrate/constants.ts` `PROTECT_TAIL`;
   `.../verbs/apply-keeper-result.ts`). This is what makes distill-idempotency mechanically true.
6. **The #29 fence:** the reconciler is derived TRUTH (watermarked, rebuild-on-hash-mismatch,
   memory-owned); this arm is authored DIRECTION (not a function of canon, never rebuilt). No
   shared store, vocabulary, or workload. Boundary test: "could a rebuild from canon reproduce
   it?" yes ⇒ #29's; no ⇒ this arm's.
7. **Game-chat interplay:** analysis presets' mint REFUSES on an active-game chat v1 (typed —
   the game owns its steering per D109; the legacy no-double-director law re-derived,
   `legacy-main:.../crew/verbs/config.ts` `CREW_ACTIVE_GAME`). Revisitable.
8. **Costs, complete:** 1 arm member (+ the vitest EXACT tuple pin,
   `tests/contracts/automation/index.contract.test.ts:125-133`) + schema arm + the output-op
   union + `SPEND_ARM_TYPES` + executor + dry-run preview + a `validate.ts` admission row + the
   widened quiet op (~11-site footprint: op signature, executor call, two compose wirings, six
   test doubles) + a `SIDE_GEN_POSTURES` member (the `no-hardcoded-side-gen-sampling` gate) +
   the state table (the merge window) + the S2 contribution + refusal copy rows. Prompt briefs
   are authored FRESH against the legacy semantics (never ported); the proven lines carried as
   semantics: narrator-not-players · optional-scaffolding/soft-tensions · retire-on-payoff ·
   empty-is-the-common-case · when-in-doubt-clean.

### S6 — `run_tool`: arms through the ONE registry (the plugin-critical extensibility shape)

Arms stay a closed engine union; extensibility rides the tool registry — plugin tools ALREADY
register into it (`registerPluginTool`, `domain/tool-use/contract/service.ts:22`, wired at
`entry/compose/automation-plugin.ts:315-322`, namespaced `plugin_<slug>_<name>`).

- **Shape:** `{ type: "run_tool", name, argsTemplate (macro-rendered JSON), resultVar? }`.
- **Execute:** MINT-time name resolution (a rule referencing an unknown/uninstalled tool never
  stores); FIRE-time unknown = `arm_error` errors-as-data — WITH the pause-not-rot posture:
  rules naming a DEACTIVATED plugin's tools pause rather than accumulate `arm_error` toward the
  20-consecutive auto-disable. Executes via `executeToolCalls` with
  `exec = { principal: the author's, triggeredBy: authorUserId, chatId: frame.chatId (null on
  global), turnId: null, roster: author's membership (null on global), signal }` —
  `ToolExecutionContext` supports the non-chat consumer by contract
  (`contract/params.ts:29-44`: chatId/turnId/roster nullable; a chat-scoped tool under null
  roster is an errors-as-data denial).
- **Gates, all existing:** the tool's capability ceiling under the author + owning-verb gates +
  `holdsAuthority` (chat rules) + fire budgets + `run_tool ∈ SPEND_ARM_TYPES`; plugin
  invocations additionally run under the membrane's per-call budget.
- **Result routing:** fire log always; `resultVar` optionally a chat/global var — NEVER prose.
- *(Rejected: arms-as-registry-tools wholesale — arms carry engine semantics tools cannot (env
  write-through ordering, transform registration, budget classes); rejected: per-domain
  hand-wired arms as the growth strategy — domain reach arrives as registry TOOLS, reachable via
  this one bridge.)* Costs: 1 arm member + schema + executor + dry-run + validate row + the
  tuple pin + the scope-Record entry + the SPEND entry. Ordinary merge.

### S7 — the trigger vocabulary (batched born-complete)

> **BUILD-STATE TRUTH-REPAIR (2026-08-28, the B6 lane).** Three quarters of this section's batch was
> already LANDED WITH C5 when B6 opened it, so the paragraph below reads as a plan for work that exists.
> Receipts: `DOMAIN_TRIGGER_TYPES` carries all four live domain events and `LIVE_TRIGGERS` marks both new
> ones live (`packages/contracts/src/automation/index.ts:51-58`, `:205-212`); the resolver CARRIES
> `character.contentChanged` rather than dropping it (`domain/automation/substrate/fact-resolver.ts`, the
> `character.updated` arm), so the "the resolver currently drops it" claim and its `:120-122` receipt are
> dead. **B6's window added exactly ONE member — `reactionsChanged`** (tuple + `LIVE_TRIGGERS` row + a
> `reaction` `TriggerFact` projection carrying `{messageId, variantId, emoji, added}` + the tuple-derived
> CHECK, which its baseline squash carried anyway). The paragraph below is kept verbatim as the DESIGN;
> only its build-state tense is corrected here.

`CHAT_TRIGGER_TYPES` = 15; `DOMAIN_TRIGGER_TYPES` = 2 — but the domain event bus carries FOUR
(`persona.updated`, `world-info.updated` unrepresented — `contracts/events/index.ts:31-37`).
**The widening is BATCHED into ONE merge window** (every tuple member pairs with the tuple-derived
bus↔type CHECK, `db/schema/automation.ts:84-87,114` — a generated-baseline edit): the two domain
members + (with B6) `reactionsChanged` + **the `TriggerFact.character.contentChanged` field the
resolver currently drops** (`substrate/fact-resolver.ts:120-122` — without it the living-library
preset degenerates to an edit-burst chore). Per-member coupled sites: tuple entry ·
`LIVE_TRIGGERS` Record row (tsc-forced) · the `TriggerFact` projection · the CHECK. B6's
already-scheduled window is the natural host. The `crew.*`/`rpg.*` mirrors stay documented, not
tupled (an event on no bus is not vocabulary).

## §4 THE PRESET CATALOGUE (data over the substrate; order = suggested build/fun order)

Every row: class 1 unless noted · lands whenever its "rides" is built · lives in the Rules
section picker ("This chat" tab) unless noted · obeys the §2 authoring laws. Committed rows are
part of the plan; OPTIONAL rows are owner picks.

| # | Preset (plain name) | Rules (trigger → arms; dialect-correct predicates) | Knobs | Rides | Status |
| - | - | - | - | - | - |
| 1 | welcome-back recap (confirm-first card) | R1 `messageCommitted` → `set_variable vars.lastBeatMs = {{expr::now.epochMs}}` (explicit high cap — law 4); R2 `chatOpened` + `!has(vars.lastBeatMs) \|\| int(now.epochMs) - int(vars.lastBeatMs) > N` → the recap `trigger_turn` arm **with `confirmFirst` ON** — the fire STASHES a class-1 card ("Recap where we left off? \[Do it]") whose stored `resolvedArm` is the static guided recap turn; host click executes. WHY a card, not chips: a chip's click posts as the clicking member (law 3); `chatOpened` is per-attach + viewer-blind and chips fan room-wide; cards are host-tier, replace-per-rule, take-once, and the stored arm is static so no staleness concern. (The class-2 INVITATION exists ONLY on the `budget_refused` path — it is not this preset's lever.) | idle threshold; recap steer text | A4 (confirm-first) | committed |
| 2 | async table nudge | `messageCommitted` (the fact carries `message.authorUserId`; `turnCompleted`'s does NOT) + idle predicate → `post_notification` with the NEW actor-excluding recipient member | idle hours; quiet hours | the third `NOTIFICATION_RECIPIENTS` member (§7 row) | committed |
| 3 | auto-add lore entries | `messageCommitted` → `insert_world_info_entry` — **confirmFirst BY DEFAULT** (the natural first card) | book, key style, confirmFirst | A4 | committed (v1) |
| 4 | periodic pacing nudge | `turnCompleted` + `int(chat.messageCount) % N == 0` → `trigger_turn` (guided) | every-N, nudge text | A3 | committed (v1) |
| 5 | auto-illustrate scene changes | trigger/predicate → `generate_image` | mode, cadence floor | A3 | committed (v1) |
| 6 | dice chips after a beat (built as "Offer chips after a beat" — the built name is authoritative, honester than this row's title: the preset is not dice-specific) | `turnCompleted` + predicate → `surface_quick_reply` | chip labels | A3 | committed (v1) |
| 7 | clock fires when full | TWO rules: R1 trigger → `set_variable inc vars.X` (capped — law 4); R2 same trigger + `has(vars.X) && int(vars.X) >= N` (law 1 — the unguarded read throws on the first-ever batch if R1 was refused) → the fired arm + a reset `set_variable` | N; the fired arm | A3; the widget = B9 | committed (v1) |
| 8 | opener chips (staple deck) | `chatOpened`/`turnCompleted` + light predicates → `surface_quick_reply` in **compose mode** (Continue · Time skip · New scene — seeds the member owns; law 3) | the deck texts | the per-choice mode field (S1) | committed |
| 9 | scene veil | `messageCommitted` + `event.message.content.contains("((veil))")` (dialect-proven) → `trigger_turn` guided fade | the veil word; redirect text | A3 | committed |
| 10 | call a vote | R7 `runRuleNow` (host) → `surface_quick_reply` in **send mode** (picks ARE the members' diegetic words) | the options | A4 + the mode field; optional `/vote` slash | committed |
| 11 | rumor mill | C1 `run_analysis` → `upsertLoreEntry` (consequences-and-hearsay brief; confirm-first; law 7) | span floor, book | C1 + C2's route | committed |
| 12 | the callback rule | R1 `messageCommitted` + content-match (`.contains`/`.lowerAscii().contains`) → TWO arms: `set_variable inc vars.debt` + `set_variable vars.debtBeat = {{expr::int(chat.messageCount)}}` (the beat anchor; both capped — law 4); R2 `messageCommitted` + `has(vars.debt) && int(vars.debt) > 0 && has(vars.debtBeat) && int(chat.messageCount) - int(vars.debtBeat) >= D` → `trigger_turn` guided "an unresolved promise resurfaces" + reset arms (`set_variable delete vars.debt`, `delete vars.debtBeat`) | the patterns; the distance D | A3 | committed |
| 13 | cutaways | `int(chat.messageCount) % N == 0` → `trigger_turn` guided "one short cutaway; seed a soft tension; resolve nothing" | N; the steer | A3 | committed |
| 14 | spotlight balance | C1 preset: analysis reads the fresh window, emits ONE `steer` line (narrator-not-players) | cadence | C1 | committed |
| 15 | story pacing analysis (C1) · distill-lore (C2) · prose-audit (C3) | the three RULED analysis presets (§7 Phase C; C1 apply: direct steer; C2/C3 confirm-first; C3 cards variant-pinned + hash-guarded + revert obligation; on-demand = R7 with the synchronous clean verdict) | steer; cadence; every-turn vs on-demand | C1–C3 | committed (RULED F7) |
| 16 | the needle (score → meter + backdrop) | C1 scoring tension 0-10 → `setVariable`; sibling rule `int(vars.tension) >= N` → `set_chat_background` | cadence; N | the `setVariable` route + the vars read proc | **RULED 2026-08-24 — SHIPS, OFF BY DEFAULT** (host opts in per room; the F6 exception's boundary is §2's clause: scores may cross, arcs/twists/guidance never) |
| 17 | illustrate on lore reveal | `worldInfoActivated` → `generate_image` (fixed `scenario` mode) | entry filter = a min-COUNT gate (the fact carries only opaque `entryIds`, no keys — an identity filter is un-authorable) | A3 | **BUILT** (`illustrateOnLoreReveal`; owner 2026-08-24 "everything optional gets included") |
| 18 | react to lore activation | `worldInfoActivated` → `trigger_turn` (cooldown belt — the fact resolves at a hardcoded `automationDepth: 0`, so the cascade guard can't bound a reaction turn's own re-activation) | guided text | A3 | **BUILT** (`reactToLoreActivation`; owner 2026-08-24) |
| 19 | auto-set scene background | `messageCommitted` → `set_chat_background` (the autobg quiet-pick — reads `fact.message.content` as the scene; cooldown-spaced; NOT spend-classed) | instruction bias | A3 | **BUILT** (`autoSetSceneBackground`; owner 2026-08-24) |
| 20 | living library (owner-global) | GLOBAL rule: `character.updated` + `contentChanged` (the S7 fact field) → quiet `generate_image` (mode corrected to `character_multimodal` at C5 build — the chat-less caption path; the `character` extraction mode is chat-required as built) | — | the owner-global lane (§3-S3) + S7 | **committed** (C5 LANDED — livingLibrary global scope, the automation settings pane, and the owner-budget verbs incl. `automation_owner_budgets`, `packages/db/src/migrations/0000_baseline.sql:54`) |

Graveyarded preset shapes (recorded so nobody re-mints them): auto-fire recap · genre-move decks
· keyword tension clocks · blind spotlight rotation · reaction-heat steering (conditional-revive:
the event-at-arm-render widening + B6) · tags-proposal queues · persona-switch turns ·
time-of-day scenery · swipe-summoned audit · campaign archive · translator transforms (250ms
transform deadline vs 5s fetch — structurally impossible) · dice-outcome clocks (payoff real,
priced WITH a future tool-results fact widening). Full arguments: provenance (§12).

## §5 The purged-capability disposition table (the honest ledger)

| Purged concept | Its capability | Carried NOW by | Status |
| - | - | - | - |
| crew lorebook-keeper | distill durable keyed lore (span-stamped, merge-at-cap, never unrevealed secrets — `legacy-main:.../members/lorebook-keeper.ts`) | template half: `insert_world_info_entry`; analysis half: C2 via `upsertLoreEntry` | committed (C2) |
| crew director — cadence | fire every N beats | `int(chat.messageCount) % N` predicates (stateless; the counter shape via the clock preset). Honesty: legacy reset only on real enqueue — the modulo form loses a refused tick until the next multiple; F4's invitations cover budget refusals | carried (live engine) |
| crew director — ANALYSIS | think-first pass: arc + twist bank + ONE narrator-only guidance | S5 `run_analysis` + the pacing preset + the S2 guidance contribution | committed (C1) |
| crew prose-audit | post-turn quiet audit → clean/issues + conservative rewrite | C3 — WITH the legacy correctness heart: variant-pin + content-hash at confirm (`legacy-main:.../crew/verbs/proposals.ts`), the revert obligation, when-in-doubt-clean | committed (C3) |
| crew card-evolution | earned-evolution card proposals | refinery (owner workshop, pre-apply snapshot, `domain/refinery/contract/service.ts:2-5`); the room/library line keeps it OUT of rules | carried (manual) |
| crew persistent guides | labeled persisted steering injections, auto-refresh — the legacy semantics: `{{previousGuide}}` continuity; blank-output-refuses-to-overwrite; disable-flushes-content-keeps-definition | **CARRIED by C1's steer route (owner-confirmed 2026-08-24, tree-receipted):** durable per-rule guidance on `automation_rule_state` delivered verbatim every turn (S2); auto-refresh per cadence under the host steer knob; blank-refuses-overwrite is literal (`persistence/rule-state.ts:30` — "undefined guidance = leave the stored guidance untouched"); disable stops delivery, keeps content; rules ARE the labels. The `{{previousGuide}}` echo is SUPERSEDED by the arc+twist state the pass carries — richer continuity than replaying its own prose | carried (C1) |
| buddy observer/reactions | ambient per-user signal→quip loop | dead scope (the companion); its engineering patterns (rate gates, never-throw-into-the-bus) live in the engine | dead |
| buddy propose/confirm | act-only-with-consent, in-RAM TTL, kill switch at confirm | S4 (the shape generalized) | carried |
| echo-chamber | ambient multi-voice chatter | dead | dead |
| agent principals (#13) | an AI with its OWN principal + ceiling (the containment suite proved the walls — `legacy-main:tests/server/domain/admin/containment.suite.int.test.ts`) | parked WHOLE; class-2-sequential is its slot; the suite is the re-proof template | parked |
| agent tool-propose (#14) | propose-tools for a seated agent | superseded by S4; spec kept as the argument | superseded |
| crew structured-output rule | "an actor is not a proposer" | `runStructuredTurn` + the `structured` role | carried |
| GM seat | standing per-game authority | dormant DDL (`rpg_games.gmUserId` nullable, `db/schema/rpg.ts:58-81`) — full-mode graft | dormant |
| **rpg-mode crew** | world-gen SECRET spine · HIDDEN clocks · session recap/distill · scene fork/fold · recruit cards (`legacy-main:packages/server/src/domain/rpg/substrate/crew-prompts.ts` + `crew-apply.ts`; purged — zero `hiddenClock` on retro) | nothing — PARKED with the full-mode graft; its twist-merge semantics independently agree with S5's | parked |

## §6 REVAMPS — existing code this direction changes

| # | What changes | Why | Shape | Pinned by |
| - | - | - | - | - |
| R1 | `turn.ts` injections merge → the S2 collection; `ChatContext` gains the teaching registry input (null = today) | one teaching home | additive op, null-op default (`rpg: input.rpg ?? null`, `entry/compose/chat.ts:1235`) | the two S2 byte pins |
| R2 | `turn.ts:627` `attachedToolNames` → union over S2 contributions' `toolNames`. **Lands WITH A1** (the contract freezes once; B7 = first non-empty contributor) | the class-2-concurrent attach path | additive; empty-union ⇒ byte-identical | the attach-matrix pin |
| R3 | `composer-utility-menu.tsx:214-229` — "Offer choices" un-game-gated | the standing/momentary pair exists wherever the fence renders | client-only | CT: menu shows in a non-game chat; same prose-slot family |
| R4 | `contracts/automation/index.ts:214` comment "(rendered at click time…)" | misleading — render is FIRE-time in the author's env (`arm-executors.ts:131-143`) | one comment edit | review |
| R5 | UNBUILT-RECORDED (RULED F1): `AUTOMATION_FIRE_OUTCOMES` + CHECK gain a suggestion terminal — the flip shape if the F1 criterion fires | recorded | would be merge-window | contract round-trip, when/if |
| R6 | UNBUILT-RECORDED (RULED F6): `ChatInjection.audience` — the flip shape if first-class inspection is wanted | v1 is host-only by construction; the #28 member `previewSection` deferral is the tripwire | additive wire field + the per-surface sweep | recorded pricing |
| R7 | NEW verb `runRuleNow(chatId, ruleId)` — host-gated, one fresh rule dispatch (depth 0) | F4's invitation confirm; B2's recovery action; on-demand analysis; legacy `runNow` precedent (`legacy-main:.../crew/verbs/run-now.ts`); `testRule` deliberately executes nothing | additive verb + proc + sweep row (PROBED) | the authority matrix (host-only v1; legacy's member-with-consent recorded as the widening) |

## §7 THE PATH — phases, every row with its HOME

Stop-anywhere holds at every row. Homes are REGION · anchor/registry · mobile (the one-shell law:
every placement is CONTENT, CONTEXT→sheet, a modal, or the settings modal; no new viewport
`@media`). The as-built chat CONTEXT strip is **Members · "This chat" (host-gated sections) ·
Preview (host-only, crown)** — `features/chat/lib/chats-section.tsx:54-88`.

**Phase A — substrate (silent; class/knobs n/a; nothing user-visible):**

| Step | Contents | Owner's test | Merge class |
| - | - | - | - |
| A1 = S2+R1+R2 | the teaching seam (final contract incl. `toolNames`, frozen) + the slot ratification (allowlist + cruiser + D-entry) + byte pins + double-teach guard + attach-matrix pin | pins green | ordinary |
| A2 = S1 | control registry + per-mode busy + the per-choice mode field + display caps; CT matrix | a hand-fired chip renders and clicks in a dev drive | ordinary |
| A3 = S3 | preset substrate (Record + tuple + knob projection + mint verb) + the committed v1 catalogue rows | tRPC create → fire → fire log | ordinary |
| A4 = S4 | both suggestion classes + the automation-bus member (+belts) + `SPEND_ARM_TYPES` + confirm/dismiss + R7 + the S1 card | the confirm-first lore preset suggests; host click executes; a rate-capped spend rule raises the run-now invitation | ordinary |

**Phase B — the visible grafts:**

| Step | Graft | Class | Rides | Owner's test | HOME (region · anchor · mobile) | Merge class | Knobs |
| - | - | - | - | - | - | - | - |
| B1 | offer-choices toggle + R3 | teaching | S2 | any chat: model offers; click composes | toggle: CONTEXT "This chat" chat-behavior section; per-user default: settings chat-behavior pane (`features/chat` owns it); wand: composer menu | ordinary | per-chat `offerChoices` (RULED F2 chat-homed) + the `groupDefaults`-tier per-user default (`contracts/settings/index.ts:827` precedent) |
| B2 | rules list + preset picker + fire log + Test/Run-now | — | A3/A4 + `listFires`/`testRule` (both BUILT, unwired) + R7 | enable auto-illustrate; the fire log shows it; press Test and Run now | a "Rules" SECTION inside CONTEXT "This chat" (beside Tool-use/Background; host-gated per-section); picker = inline popover; CONTEXT→sheet mobile. The dormant home automation tile stays as-is until B3 | ordinary | per-preset knobs; v1 edit = re-mint |
| B3 | quick-reply chips | 1 | S1 | a rule surfaces chips; click behaves per mode | the ONE above-composer S1 contribution; in-column mobile. RETIRE the home automation tile (its own contract) | ordinary | per-rule chip arms |
| B4 | confirm cards + invitations | 1 | S1+S4 | flip a rule to confirm-first; its next fire suggests | same S1 mount (cards above chips; one visible) | ordinary (R5 unbuilt) | confirmFirst; the invite-on-refusal ask defaults ON for spend arms (RULED F4) and the **per-rule OPT-OUT LANDED 2026-08-29 (#804)** — `automation_rules.suggest_on_refusal` (boolean NOT NULL DEFAULT true), ANDed with the arm-shape derivation at the one gate that raises the ask (`domain/automation/engine/dispatch.ts::inviteOnRefusal`), flipped by its own host-gated `setRuleSuggestOnRefusal` verb + proc (NOT the rule PUT, which would clear the B10 mint provenance), and surfaced as a labelled switch on the rule row for SPEND rules only. Spelled `suggestOnRefusal` after the ruling's own name in §8 |
| B5 | imagery client | — | the 3 unwired procs + `background` mode (`contracts/imagery:17`) | /imagine → edit → set-as-background → provenance | /imagine: slash-commands registry; preview→edit: lightbox → `imageEdit` modal (modal registry, chat-owned, content trigger); set-as-background: the "This chat" Background section + a same-action image shortcut; provenance: the lightbox detail strip | ordinary | none new |
| B6 | reactions MR0–MR2 | 2-conc (human) | own plane + the `reactionsChanged` chat-bus member (FULL coupled-site list: union + belt + partition call + (if durable) the `chat_events.type` CHECK + the `toHaveLength(29)` pin `tests/contracts/chat/index.contract.test.ts:60` + the partition pin :73-76 + client apply-arm exhaustiveness `tests/client/data/bus/apply-chat-bus-event.test.ts:469-475` + the bus-coverage gate — the three test sites are vitest, behavioral suites owed) **+ the S7 trigger batch riding this window** | react; second tab sees live | pills: `message-footer` contribution (committed rows only; one line + "+N" overflow; ≥44px hit via the pointer token, small visual box); picker: hover cluster at fine, INSIDE the ⋯ menu at coarse | **merge-window** (db baseline + the batched tuple CHECK — pin the backup) | none new. Ordering flag (RULED F5 taste): schedule as the front half of a B6+B7 unit |
| B7 | reactions MR3–MR5 + the first tool-attach | 2-conc (character via tool) | the speaker-span parser (`packages/kit/src/speaker-label/index.ts:64`; grouping fitness = MR3's first task) + A1's attach axis + a `react` tool in the ONE registry | react to one speaker's line; the model acknowledges; a character reacts back | segment targeting: the same cluster, whole-message default at coarse | ordinary | attribution caps (K + content) |
| B8 | checks | ask=S1; result=canon | S1 + the `rollDice` verb (member-gated CSPRNG bake-once) | chip → server roll → narration reacts | ask: the S1 mount (game arm); result: a `tool-renderers` contribution in-thread | ordinary | game config |
| B9 | clocks | 1 | the clock preset (two-rule) + `SegmentedClock` over `vars` + **the vars read proc (priced at S5's `setVariable`; B9 consumes it)** | clock fills; the arm fires; host resets via the Rules row (mechanism: R7 over a preset-minted reset rule, decided at build) | widget: a `thread-flank` contribution (stacks below the thread <512px by the seam's own law); config: the Rules section | ordinary | N; the fired arm |
| B10 | saved rosters (#26 — the ruled word, #901 Fork 2; SHIPPED strings still say "cast" until #902) | — | `rosterMemberSpecSchema`/`seatKnobsSchema` (`contracts/chat/roster.ts:76-99` — pre-cut; D80 `setSeatKnobs`) + the room's enabled PRESET IDS + KNOB VALUES re-minted on apply (the accrual travels; doubles as B2's provenance flip-shape record) | save a roster + rules; one click into a new chat | save: Members tab host action; apply-new: the `newChat` picker modal gains a start-from-saved-roster door (shipped label today: "Start from saved cast"); apply-existing: the Members add door (shipped label today: "Saved casts…" — the spec's "Add cast…" never shipped, `committed-members-tab.tsx:146-154` records why); library management: a Configuration-section `CollectionContribution` | **merge-window** (schema) | seat knobs + preset ids |
| B11 | room Activity tab + inbox doorway (#687; owner-placed 2026-08-24) | — | the EXISTING durable stores read cross-source: the automation fire log (confirmed-suggestion executions carry the confirmer stamp), notices, plugin invocations for this chat — ONE-HOME: no second store, the tab is a READ of what the Rules-section fire log already consumes; (digest) B6's reactions plane when it lands | open the Activity tab: this room's fires/cards/plugin actions listed; the shell badge opens the inbox | tab: a CONTEXT-strip sibling of Members/"This chat"/Preview (CONTEXT→sheet mobile); cross-room stays the EXISTING notifications inbox — the top-bar/room-list spot is a BADGE/entry to it, never a second feed (the #227 reachability fix rides this) | ordinary | none new. Rides the B6 wave (the reactions-while-away digest pairs). Pending S4 cards stay F1 in-RAM: the feed = live-pending + durable history; "missed cards" = the recorded R5 durable-row flip, priced separately |

**§7-B7a — THE B7 BUILD RECORD (2026-08-28, the B7 lane; design-first, decisions + rejected arms).**
B7 = MR3 (segment targeting) + MR4 (the bounded attribution loop) + MR5 (the `react` tool), plus TWO
owner-required per-chat toggles. The MA-2 mini-spec (`../architecture/proposed/message-reactions-mini-spec.md`)
is REFERENCE; where it and this record differ, this record is what was built.

1. **Segment anchor = a `parseSpeakerSpans` LINE index over STORED CANON; the name set = present
   CHARACTER seats' names.** The fitness suite (`tests/kit/speaker-label/anchoring.suite.test.ts`, df18b191f)
   ruled the parser FIT with no grouping layer — line-level spans ARE the index space (narration
   occupies indices; consecutive same-speaker lines are distinct targets). *(Rejected: the mini-spec's
   `speaker-segments` port into `@orb/kit` — a second recognizer over the ONE parser, never built.)* The anchor substrate
   is canon bytes, NEVER display text: the client renderer parses `renderMessageForDisplay` output
   (`message-content.tsx:135-140`), which regex/macros/plugins can reshape, so display indices are not
   shared truth. Character-name mirror: `speakerThemesByName` keys client-side (`lib/attribution.ts:286` —
   character seats only) = `loadPresentCharacterNames` server-side.
2. **The row stores `(segmentIndex, segmentSpeaker, segmentSnippet)`; a stale trio DEGRADES to
   whole-message.** The suite's sharpest finding: `(index, speaker)` alone is defeated by a
   same-speaker structural insert (silent mis-target). The snippet (canon span text, capped
   `REACTION_SEGMENT_SNIPPET_MAX`) is the fingerprint that detects it, and doubles as the attribution
   quote. Validation is ONE kit helper (`resolveSegmentAnchor`, speaker-label — both consumers, one
   rule). The WRITE re-derives server-side: the wire carries the index + the claimed speaker; the
   server parses canon itself, refuses a mismatch typed, and stores ITS OWN speaker/snippet — a
   member never writes free text into a column every transcript renders (the emoji-tuple lesson).
   UNIQUE widens as two PARTIAL indexes (whole-message / segment-keyed) — a single unique over a
   nullable `segment_index` would stop deduplicating whole-message rows (SQLite NULLs are distinct).
3. **MR4 attribution = an S2 teaching contribution (chat's own, order 2), ONE `in_chat` depth-0
   system injection.** *(Rejected: the mini-spec's per-message inline splice — a second prompt-mutation
   plane; §3-S2's convergence law puts all prose steering on the ONE ChatInjection channel.)* Reads
   the newest `REACTION_ATTRIBUTION_SLOT_WINDOW` reacted slots, SELECTED variants only, above the
   HOST's D16 floor; caps: `REACTION_ATTRIBUTION_MAX_PER_MESSAGE` (K=8, most-recent) + the 32k
   `REACTION_ATTRIBUTION_CONTENT_CAP` (past it, no re-parse — whole-message note). Constants in
   `contracts/chat/reactions.ts`; the owner-tunable knob surface is a recorded flip, not built. No
   reactions ⇒ `[]` ⇒ byte-identical (the A1 property, per contributor).
4. **MR5 = a builtin `react` tool in the ONE registry (imagery's `tool/` mirror), attached through
   the S2 `toolNames` axis — the first non-empty contributor.** Name minted ONCE
   (`CHAT_REACT_TOOL_NAME`). Args `{ character, emoji, toSpeaker? }`: the target is the room's newest
   committed message's selected variant; `toSpeaker` narrows to that speaker's LAST span. *(Rejected:
   model-supplied message/variant ids — the model cannot know ids; name-targeting is Marinara's own
   proven surface.)* Write = `createReactAsCharacter`, a standalone chat verb factory (compose-wired
   into the tool def; *rejected: a `ChatService` member — its only consumer is the composition root,
   and the service tax lands on every double*). ADD-ONLY (a model retry must not un-react),
   attributed to the CHARACTER's seat, durable-first `reactionsChanged` emit, errors-as-data
   refusals. Description = a `chat.tool.reactDescription` prose slot (home `user`, the imagery #578
   shape); NO teach injection (the tool-use posture — the wire description IS the teach).
5. **TWO per-chat toggles, the `offerChoices` pattern EXACTLY (metadata boolean · host-set `chat.set…`
   verb · absent = inherit the host's per-user default · a contracts resolve helper), side by side in
   the room's chat-behavior surfaces:**
   - `charactersCanReact` — gates the react-tool ATTACH (contribution emits the tool name only when
     the resolved knob is ON). Default **OFF / opt-in** (owner: autonomous AI reacting is opt-in).
   - `reactionsEnabled` — the B6 plane's master switch. Default **ON** (the shipped feature stays
     on; it becomes disableable). Resolved OFF ⇒ `listReactions` answers `{enabled:false, groups:[]}`
     (the pill row and picker doors vanish for EVERY member off one read), `toggleReaction` and the
     react tool REFUSE server-side, the attach contribution and the attribution contribution both go
     empty. The wire read is the verdict carrier *(rejected: stamping a resolved boolean on
     `ChatDetail` — the room read has no settings access, and a member's client can never resolve the
     HOST's default locally)*. Verb-time resolution rides a narrow injected `ChatContext` op (the
     host's `UserSettings.chat` reaction fields under the present host seat).
6. **Merge class CORRECTION: B7 is a MERGE-WINDOW row, not ordinary.** The B6 schema header
   deliberately deferred the segment columns ("NO SEGMENT COLUMNS YET… the same baseline squash any
   new column costs", `db/schema/chat.ts:651-654`); the B7 row's "ordinary" cell predates that
   deferral. The squash is baseline-only (pre-launch), regenerated from the isolated B7 worktree.

**Phase C — the analysis arm + the platform machinery:**

| Step | Contents | Class | Owner's test | HOME | Merge class | Status |
| - | - | - | - | - | - | - |
| C1 | S5 `run_analysis` whole (arm + state table + quiet-op widening + S2 contribution) + the pacing preset | 1 | enable; after N beats verify the guidance line in the host Preview tab (Steering source, `assembly-preview-panel.tsx:1-18`), then judge the prose; the steer knob changes direction | knobs: the Rules section; guidance visibility: the as-built Preview tab suffices (host-only `when` + crown, `chats-section.tsx:83-88`) | **merge-window** (the state table) | committed (RULED F7, direct steer) |
| C2 | distill-lore preset (the `upsertLoreEntry` route + settled-span law + `neutralizeMacros`) | 1 | play a settled span; a card offers entries; confirm lands them, idempotent | cards: the S1 mount; entries: the world-info UI | ordinary | committed (confirm-first) |
| C3 | prose-audit preset (variant-pinned + hashed cards + `@orb/ui/diff` collapsible body + the revert obligation; on-demand = R7 with the synchronous clean verdict) | 1 | a flawed reply draws a card; confirm applies; a swipe between suggest and confirm refuses typed; clean draws nothing | the S1 card variant | ordinary | committed (confirm-first) |
| C4 | S6 `run_tool` arm (+ pause-not-rot) | 1 | a rule runs a registered tool into a var; an uninstalled tool refuses at mint | the Rules section arm vocabulary | ordinary | committed (the platform shape) |
| C5 | the owner-global lane (S3 scope axis: admission + engine nullable-seam + the owner-budget table + the WI ownership gate) + the living-library preset | 1 | a global rule fires on a character import with no room open | the `automation` settings pane (the global rules surface: list + picker + budget) | **merge-window** (the budget table) | committed (the platform ruling) |
| C6 | the notification recipient member (actor-excluding; four code sites: tuple+zod · resolver · the `arm-executors.ts:160` ternary → exhaustive dispatch · the membrane's silent-downgrade line `membrane.ts:445` + guest-visible vocabulary) + the async-nudge preset | 1 | in a two-human room, only the waiting member is pinged | the inbox (existing) | ordinary | committed |
| C7 | plugin client + snippets + plugins joining S4 posture 2 + `llm.quiet` (+ its two vitest exact pins: the ordered 13-member `PLUGIN_CAPABILITIES` `toEqual`, the `HOST_FUNCTION_CAPABILITY` `toHaveLength(20)`) + the plugin-tool per-turn attach seam + the plugin egress rate floor + `neutralizeMacros` on plugin lore writes | 1 | install → grant → a plugin chip renders and confirms | per the plugin program + §7-C7a below | per its plan | **UNBLOCKED 2026-08-24** — the D46 review (#605) and all seven of its findings are CLOSED and security-verified; #24 is out of Parked. The two remaining P3s (#627 runtime log, #628 residuals) are non-blocking |

**§7-C7a — THE INTEGRATION, which is C7's actual build-from (the runtime is `../architecture/proposed/plugin-design/`; this is how it MEETS this program).** The plugin server stack is BUILT (P1–P4+P6) and exposure-cleared; C7 is the client surface plus these seams:

1. **`run_tool` IS the extensibility shape — arms never grow for plugins.** Plugin tools already register into the ONE registry (`registerPluginTool`, `domain/tool-use/contract/service.ts:22`, wired at `entry/compose/automation-plugin.ts:315-322`, namespaced `plugin_<slug>_<name>`). So plugin tools become automation actions with **ZERO further arm-surface growth** — the owner's re-scope ask ("plugins can extend what automation can DO") is satisfied by C4's arm, not by new arms per capability. A plugin that wants automation reach ships a TOOL.
   **BUILD-STATE TRUTH-REPAIR (2026-08-28):** the code deliberately NARROWED this from the line above —
   `run_tool` admits ONLY plugin-sourced, author-owned tools, never builtins (`domain/automation/engine/arm-executors.ts:18-30`). The rpg builtins are turn-scoped registrants that already refuse off a turn, so admitting them into a turn-less rule arm would be a guaranteed `arm_error` generator — the exact rot D146-d exists to prevent, arriving through the front door; and imagery's builtin duplicates the `generate_image` arm (C4/#16), so admitting it would be two homes for one act. A future builder must NOT re-widen `run_tool` to admit builtins through this door — the sanctioned extensibility path for a builtin capability is the reachability predicate in `domain/tool-use/substrate/reachability.ts` plus the capability ceiling the builtin already declares, not a new arm and not a second registry.
2. **TWO DOORS, do not conflate them.** Rules reach plugin tools via `run_tool` **now-shaped** (C4). Per-TURN **attach** is a different seam and needs the enablement-contribution design at plugin GA — it is the S2 `toolNames` axis (A1/R2), and today `attachedToolNames` is the union over teaching contributions. Rules-reach and turn-attach are separate doors sharing one registry.
3. **Pause-not-rot for deactivated plugins** (S6): a rule naming a DEACTIVATED plugin's tools PAUSES rather than accumulating `arm_error` toward the 20-consecutive auto-disable — otherwise disabling a plugin silently rots every rule that used it.
4. **The ceiling is the INSTALLER's, never the caller's** (#610, fixed 2026-08-24): a plugin tool's `can()` resolves the installing principal's present role in the invocation chat via `loadPresentRole`. This is the shape the transform and event registrars already used; `can()` was REMOVED from `registerPluginTool` because it could not express a check about a principal whose roster is not in scope.
5. **Upgrade re-consent triggers on widened REACH, not capability names** (#615): an upgrade keeping `net.fetch` while swapping its `netHosts` allowlist lands `disabled` pending re-confirmation. Narrowing carries forward silently.
6. **The membrane's standing walls C7 must not re-litigate:** no message-write op exists on the plugin surface and none may be added (§1's class-1 wall); plugin lore writes carry `neutralizeMacros` + the attach gate + the 64-entry cap (#611); `notify` carries the 60 s per-(plugin, chat) floor one-homed at `AUTOMATION_NOTICE_COOLDOWN_SECONDS`; `runSnippet` carries a per-user concurrent-snippet ceiling (#613).

*Provenance: `docs/reviews/stickler/2026-08-24-automation-platform-axes.md` §3 (written against the BUILT membrane, unlike the parked plugin set) + `plugin-automation-juice.md` rows 11/14/15.*

**§7-C7b — THE PLUGIN UI PLANE (#679) — pointer only; the design is ONE-homed at
[`docs/design/plugin-ui-plane.md`](plugin-ui-plane.md) (owner-ruled 2026-08-24, build-phase-ready).**
The juice A2-F5 renderer gap ("a plugin cannot register a client ToolRenderer") is CLOSED BY DESIGN
there. What a builder needs to know from here: plugin UI is a DECLARATIVE CONTRIBUTION TREE over
sealed `@orb/ui` at the existing D70 contribution anchors, two tiers on one zod spec vocabulary
(Tier S: activation-registered specs, server-guest action round-trips; Tier C: an optional `ui.js`
in a client-side QuickJS-WASM Web Worker — the same engine family as `infra/plugin-host`), one new
`ui.surface` capability, every surface inside a first-party plugin-labeled shell. Owner rulings
folded there (six steers, verbatim in its §0): capability-first (walls protect the system and OTHER
users only); ST extension-ability PARITY is the bar (its §5 register, 35 rows all classified);
integrated-primary — the iframe arm is DEMOTED to the `ui.frame` hatch, which the full-parity
ruling then COMMITTED as scheduled phase U7 (security-executor-gated, rides the card-frame
substrate); "all the optional stuff" COMMITTED — no deferred class remains (phases U0–U8,
stop-anywhere: U0 contracts · U1 Tier-S settings · U2 chat anchors · U3 tool cards · U4 Tier C +
the one CSP delta · U5 slash/chrome/dialog/toast · U6 parity tail incl. the display-transform seam
· U7 the frame hatch · U8 ecosystem: URL install, `databank.ingest`, card extension fields,
dynamic palette rows); the five structural refusals are an ENABLEMENT PRICE SHEET (its §5a) —
refused by default, owner-purchasable, other-user walls marked. Residual owner ask: TTS/STT
(substrate, engine-level). Build-state receipts (dated 2026-08-24, LANDED per the 2026-08-28
truth-repair): user-scoped plugin management is on `main` — D147, #675, commit `8340b7f87` ("plugins
are USER-SCOPED — ownership is the authority"); the five seeded example plugins likewise —
commit `79e89d255`. Both are on local `main` as of this fold.

**Stop-anywhere:** after A: silent, pins green. B1: chats offer choices. B2: rules as toggles
with feedback. B3/B4: the room talks back and asks permission. B5: images in the room. B6/B7:
reactions, then reactions that steer. B8/B9: dice and countdowns. B10: rooms reusable. C1–C3:
the story is directed, remembered, and proofread — each separately landable. C4–C7: the
platform. No row renames, re-types, or migrates anything an earlier row shipped.

**Acceptance matrix (per-action identity floor; every landed step's tests witness its row):**
rule arm direct → author (`authorUserId`), fire budgets + arm gates; model-calling arms →
triggeredBy = the AUTHOR (the funder), runAs = host box, D17 fail-closed + depth + rate; S4
confirm → author stays the frame, confirmer authorizes, `holdsAuthority(author)` re-run,
VOID-on-handoff; tool on a turn → the turn's resolved host Principal, D109-2 inheritance,
capability at attach + authority at execute; chip click → the clicking member (send = their
turn; compose = a draft; execute = the op's own gates); reactions → the member's participant
seat, membership floor, no lock; global rule → the author under the owner check, the owner
budget; plugin → the installing principal under grants; guidance → no authority (macro-inert
prompt data).

## §8 The rulings (all DECIDED; recorded with flip shapes)

F1 in-RAM+TTL (durable rows = the recorded flip, criterion: wanted suggestions expiring unseen
in host-absent rooms) · F2 chat-homed `offerChoices` (+ the per-user default tier) · F3
three-stop reactions (scope maximal, merge shape one stop at a time) · F4 `suggestOnRefusal` ON
for spend arms — **its per-rule opt-out landed 2026-08-29 (#804) under this exact name**, as
`automation_rules.suggest_on_refusal` defaulting TRUE, so the ruling's default is now the column's
default rather than the absence of a column · F5 ladder order = taste · F6
host-only-by-construction, NO UI (rule-state table

- ephemeral injection; `audience`/plot-panel = R6 recorded; the #28 member `previewSection`
  deferral is the tripwire) · F7 all three analysis presets SHIP (C1 direct steer; C2/C3
  confirm-first) · **VOID-ALL on host handoff** (authority died, its pending asks die; re-fire
  under the new host mints fresh — offer-orphans rejected) · **WI-on-global-rules: legal under the
  book-OWNERSHIP gate** (§3-S3; the room-consent check stays for room-fired writes) · the
  platform re-scope (bridge 011): automation is a PLATFORM; "not in v1" only ever means
  UNWIRED-but-typed. **F6's ONE ruled exception (2026-08-24): a published analysis SCORE may cross into chat vars (the needle, catalogue #16, host-opt-in and OFF by default) — arcs, twists and guidance NEVER do.**

## §9 Unknowns and owner-pending, each with its probe

1. **RULED 2026-08-24 (was owner-pending) — the needle (catalogue #16) SHIPS, OFF BY DEFAULT.**
   An analysis SCORE may cross into the member-visible (and plugin-`chat.read`-readable,
   `host-v1.ts:86-87`) vars plane; the host opts in per room and no room is born with it enabled.
   **The boundary, which is the ruling's whole point: scores may cross; arcs, twists and guidance
   NEVER do** — F6 stands unchanged for everything else the analysis arm computes, and this is its
   single ruled exception, never a general opening. NOTHING in this spec is owner-pending.
2. Speaker-span parser fitness for segment ANCHORING — MR3's first task: a fixture suite over
   multi-speaker variants before any reaction stores a segment index.
3. The S2 guidance injection's depth — no retro `AUTHORS_NOTE_DEFAULT_DEPTH` constant exists
   (zero grep hits in contracts); a domain constant argued at A1/C1 build against
   `assembly/context.ts`'s in-chat depth conventions (PD-63 single placement).
4. The `run_analysis` window READ SUBSTRATE (the per-route LAW is fixed — §3-S5.5; only the
   serving module remains): `pnpm ast refs` on the fact resolver's message reads + the #29
   block-substrate precedent; decide at C1 build.
5. The C1-build one-line re-confirm: the assembly Preview tab remains the only
   assembled-prompt surface and remains host-only (the F6 premise guard).

## §10 PROVENANCE (the argument, for anyone who wants it)

This spec consolidates, and supersedes as reading material, four review documents (all
`docs/reviews/stickler/2026-08-24-*`): `final-interaction-specification[-RULED].md` (the
five-lens panel: 39 findings adjudicated, 6 structural refolds; plus the 2026-08-23 plan/audit
lineage it superseded), `interaction-ia-placement.md` (every home above; one adversarial round,
7 findings folded), `automation-platform-axes.md` (the platform axes born-whole audit + the
stale-claim lens: 41 claims checked, 6 stale — every one a build-state tense from a doc or
comment; the proposed Documentation-Law rule lives there as §7), and
`plugin-automation-juice.md` (three fable generations; two fun-honesty passes + a completed
two-lens law/cost round: 16 findings, twelve survivors changed; the graveyard arguments). The
corpus was built against the full commissioned reading set (the pain inventory, the carve spec,
the proposed sets, the ledger, and WHOLE-FILE legacy-main reads of the purged crew/buddy/rpg-crew
code, cited per read above). Dialect claims were probed live twice (a recovered adversarial run

- an independent orchestrator probe of `packages/kit/src/cel`). Stale-claim rate across the
  corpus audit: 6/41 + 3 found-and-fixed in our own passes — all build-state tenses; the earned
  rule: build-state claims carry a dated receipt or do not exist.
