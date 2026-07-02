# 03 — Actions: the Closed Union, Capabilities, Budgets, and the Cascade Guard

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.** What a
> rule can DO. Every arm: snake_case id (the D58 rpg tool naming convention), inline arg schema, the
> injected front-door op it dispatches through, and its authority/budget class. The D46-committed
> list (set a chat variable · run a macro template over the draft · insert a world-info entry ·
> surface a quick-reply · post a notification · trigger a generation) maps onto arms 1–6; the image
> arm and the reserved crew/rpg arms extend it per imagery.md / D59 / D58.

---

## 0. Action-list shape

**DECISION: a rule carries an ORDERED action list (1–8 arms), executed sequentially; an arm failure
aborts that rule's REMAINING arms (they may depend on it) but never another rule and never the
turn.** WHY a list: the dominant ST Quick-Reply pattern is "set a var, then inject, then notify" —
forcing one action per rule triplicates the predicate and makes ordering an accident of rule sort.
*(Rejected: one action per rule — predicate duplication + cross-rule ordering ambiguity; rejected:
parallel arm execution — arms share the variable env and order is semantics.)*

```ts
export const AUTOMATION_ACTION_TYPES = [
  "set_variable", "transform_draft", "insert_world_info_entry", "surface_quick_reply",
  "post_notification", "trigger_turn", "generate_image",
  // reserved (typed, refused by createRule until their domains land — 01 §1's LIVE posture):
  "enqueue_crew_workload", "rpg_verb", "force_activate_entries",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const automationActionSchema = z.discriminatedUnion("type", [ /* the arms below */ ]);
export type AutomationAction = z.infer<typeof automationActionSchema>;
```

Every `template` field below renders through `kit/macro` against the dispatch `MacroEnv` (which
includes `{{expr::…}}` — 02 §3), with injected clock/PRNG and `strictArgs` per 02 §5. Rendered
outputs are length-capped per arm (each cap below).

## 1. The arms

### 1.1 `set_variable`

```ts
z.object({
  type: z.literal("set_variable"),
  scope: z.enum(["chat", "global"]),
  key: z.string().min(1).max(128),
  op: z.enum(["set", "inc", "dec", "delete"]),
  value: z.string().max(4096).optional(),   // a TEMPLATE; required for set, the operand for inc/dec (default "1")
})
```

- **Injected op:** `chat.applyVariableOps(chatId, ops, origin)` for `scope:"chat"` — the chat
  domain's variable seam; the ops append a delta attributed to the CURRENT turn's variant when one
  is in flight, else a standalone chat-state delta (the seam the delta-fold model already defines
  for regex/guided writers). `scope:"global"` → `setGlobalVariable`/`deleteGlobalVariable` on the
  RULE AUTHOR's namespace (02 §4).
- **Authority:** chat scope = room-state write = host authority (the author IS the host in v1 —
  §2); global scope = the author's own `fetchOwned` row.
- **Budget class:** free (no model call).

### 1.2 `transform_draft` (the D46 "run a macro template over the draft" — rides the D50 seam)

```ts
z.object({
  type: z.literal("transform_draft"),
  target: z.enum(["user_input", "assembled_dynamic"]),
  template: z.string().max(8192),   // receives {{draft}} = the current target text; its render REPLACES the target
})
```

- **Mechanism — this arm is the first producer of the D50 `PromptTransform` seam (04 §6).** It does
  NOT execute from the watcher: a rule with `transform_draft` arms and a turn-scoped trigger
  (`turnStarted`) is REGISTERED into the pipeline's ordered transform list at compose; the pipeline
  invokes it at the fixed points 04 §6 defines. WHY: prompt mutation cannot be a fire-and-forget
  bus effect (D50's core catch) — by the time a bus subscriber runs, the prompt has shipped.
- `target:"user_input"` applies in SEND after the macro pass, before USER_INPUT regex (author-side
  transform ordering — chat.md Part II rule 1). `target:"assembled_dynamic"` applies at end of
  BUILD over the dynamic half only. **The static half is untouchable by rule** — a per-turn
  transform on the cache-stable prefix busts prompt cache every turn; a rule wanting static-half
  content should `insert_world_info_entry` (budgeted, cache-aware) instead. *(Rejected: a
  `target:"assembled_static"` — a footgun with a per-turn cache bill; rejected because measured,
  not speculative: the §8 breakpoint machinery exists precisely because static-half stability is
  worth ~5300 tok/turn.)*
- **Authority:** host. **Budget class:** free. Render failure → the target passes through UNCHANGED
  (+ diagnostic) — a broken rule must not eat the user's message.

### 1.3 `insert_world_info_entry`

```ts
z.object({
  type: z.literal("insert_world_info_entry"),
  bookId: z.string(),                        // must be a book ATTACHED to the rule's chat (validated at create + dispatch)
  entryKey: z.string().max(256),             // idempotency handle: same rule+entryKey UPDATES its own prior entry
  keys: z.array(z.string()).max(16),         // activation keywords; empty ⇒ constant entry
  contentTemplate: z.string().max(8192),
  position: z.enum(["before", "after"]).default("before"),
})
```

- **Injected op:** `worldInfo.upsertEntries(bookId, entries, origin)` — the SAME committed op the
  D59 crew keeper writes through (chat-crew-design/03 §1); one write path, hand-edit-safe (the
  keeper's guard semantics apply: an entry the host hand-edited is not clobbered by re-upsert).
- **Authority:** host + book attachment to the chat (a rule cannot write an unattached book — the
  attachment IS the consent that this book belongs to this room).
- **Budget class:** free. Cap: a rule may own ≤ 64 entries per book (`entryKey`-counted) — a
  looping inserter fills a book otherwise.

### 1.4 `surface_quick_reply`

```ts
z.object({
  type: z.literal("surface_quick_reply"),
  choices: z.array(z.object({
    label: z.string().max(80),
    sendTemplate: z.string().max(2048),      // rendered AT CLICK TIME as the clicking member's message text
  })).min(1).max(4),
})
```

- **Mechanism:** emits `quickReplySurfaced` on the automation bus (04 §5); the client renders
  choice chips (the rpg `offer_choices` chip slot — rpg-design/05 §3 #22 is the UI precedent); a
  click sends the rendered text as THAT member's normal chat message (their principal, their
  authority — the chip is a composer shortcut, not an authority vector). Chips are transient
  (replaced by the next surfacing, dropped on turn start) — no table.
- **Authority:** host surfaces; any present member may click. **Budget class:** free.

### 1.5 `post_notification`

```ts
z.object({
  type: z.literal("post_notification"),
  recipient: z.enum(["host", "all_members"]),
  messageTemplate: z.string().max(200),
})
```

- **Injected op:** `notifications.emit` with ONE additive `NotificationEvent` member:
  `{ type: "automation-notice", recipientUserId, payload: { ruleId, chatId, message } }`. The
  rendered `message` (≤ 200 chars) rides the payload — a deliberate, argued exception to the
  ids-only habit: a notification that says only "rule fired" is useless, the renderer is macro over
  room state every recipient can already read (recipients are participants by construction), and
  the union stays closed + credential-unrepresentable (the field is a capped string rendered
  server-side from a host-authored template). Flagged for the notifications owner (05 review
  flags).
- **Authority:** host authors; recipients must be chat participants. **Budget class:** free, but
  floor-limited: ≥ 60s cooldown per rule with this arm (inbox spam trains dismissal —
  chat-crew-design/04 §5's lesson).

### 1.6 `trigger_turn` (the gated one — an autonomous chat turn)

```ts
z.object({
  type: z.literal("trigger_turn"),
  speakerCharacterId: z.string().optional(),    // force the speaker; absent ⇒ normal arbitration
  guidedTemplate: z.string().max(4096).optional(), // rendered → a guided steer for the turn (chat.md §6 placement rules)
})
```

- **Injected op:** `chat.requestTurn(chatId, { triggeredBy, initiator: "automation", automationDepth,
  speakerCharacterId?, guided? })` — the turn pipeline's non-human-initiator seam (the D46
  born-compliant prerequisite #3, built in Phase 5). `triggeredBy` = the RULE AUTHOR (D19: the
  human responsible — spend attribution, abort rights); `runAsUserId` = the host as ever.
- **Authority + consent:** the D17 axes apply UNCHANGED — a hosted `max-pro-sub` turn with
  `triggeredBy ≠ owner` is refused unless owner consent (default OFF); local compute rides the
  per-member COUNT budget. Automation adds its OWN budget on top (§3) because owner-consent is an
  attribution gate an owner-authored rule sails through — the exact hole D46 names.
- **Budget class: SPEND.** Debited against §3's ceilings before the op is called; carries the
  remaining per-day $ ceiling onto the turn's budget axis so the turn itself can refuse.

### 1.7 `generate_image` (distinct from `trigger_turn` — an image, not a chat turn)

```ts
// The arm does NOT own its arg shape. @orb/contracts/imagery owns generateImageActionArgsSchema
// (imagery-design/01 §6: mode, prompt, negative, n, size, subjectCharacterId, useAvatarReference,
// reuse, quiet); automation IMPORTS it into the union — one home per shape:
z.object({ type: z.literal("generate_image") }).and(generateImageActionArgsSchema)
// arm type: { type: "generate_image" } & GenerateImageActionArgs
```

- **Schema home:** `@orb/contracts/imagery` (imagery-design/01 §6 + 04 §1 — the args are imagery
  vocabulary: modes, size presets, reuse policy; automation owns the union membership + dispatch,
  not the arm's inner shape — the workloads `ParamsByKind` split). *(Rejected: a second inline
  schema here — it drifts from the op it dispatches; `no-inline-union-redecl`.)*
- **Injected op:** `imagery.generatePicture` — imagery-design/04 §1's dictated mapping: args map
  1:1 onto `GeneratePictureParams`; the arm executor macro-renders `prompt` first (it is a
  template like every arm template — §0), sets `caller` = the rule author and `chatId` = the
  triggering chat, and consumes `quiet` itself (post vs fire-log return — imagery has no posting
  concept). This arm IS the `/imagine` server path (one path: the client command and a rule both
  land here), and the D48 `generate_image` TOOL shares the name + schema (minus `quiet`) by
  imagery-design/04 §1's dictation.
- **Authority:** host. **Budget class: SPEND** (a hosted image-gen call — same ceilings as 1.6;
  images count against `max_spend_actions_per_day` and the $ ceiling via the returned `costUsd`).

## 2. Who actions run AS (the authority model, concrete)

**Rules execute as their AUTHOR's principal** — v1 authors are hosts (D46), so every arm runs with
host authority on that chat. At DISPATCH (not just create), the engine re-verifies the author still
holds `can(author, "host", {kind:"chat", roster})` — a demoted/removed ex-host's rules stop firing
instead of wielding stale authority; such a fire is skipped + logged (`ruleErrored`,
`code:"author-lost-authority"`), and after the 02 §1 error threshold the rule auto-disables.
Member-authored rules stay reserved-additive per D46 (they would write the per-participant overlay,
never the room bag — a security-model change, not a dial). *(Rejected: rules running as a synthetic
"automation principal" — a fourth identity with no D19 story; the triple (caller/triggeredBy/
runAsUserId) already models this exactly.)*

## 3. Budgets (the axis owner-consent does not cover)

Two layers, both DDL-backed (04 §1):

- **Per-rule:** `cooldown_seconds` (min 0; min 60 when a `post_notification` arm is present),
  `max_fires_per_hour` (default 30, cap 240).
- **Per-chat (the `automation_budgets` row, host-editable):** `max_fires_per_hour` (default 120),
  `max_spend_actions_per_day` (default 10 — arms 1.6 + 1.7 combined), `max_usd_per_day` (default
  1.00; `NULL` = no dollar ceiling, local-only setups).

Enforcement is the DB-backed count-limiter pattern (`transport/rate-limit`, the same machinery
chat's per-member turn budget uses — chat.md Part III §5), keyed `(ruleId)` / `(chatId,
"automation")`, debited BEFORE the op call inside the dispatch sequence; `$` accounting reads the
turn/image cost the ops return and accumulates on the budget row (`usd_spent_today`, reset by UTC
day from the injected clock). A budget refusal is not an error: the fire is recorded
`outcome:"budget_refused"` and the rule stays healthy. *(Rejected: post-hoc metering via stats —
by the time stats lands the delta, the spend happened; the ceiling must sit before the op.)*

## 4. The runaway-cascade guard (event→action→turn→event, closed)

**DECISION: origin tagging on the TURN PATH + a depth counter, with default depth-cap 1 — an
automation-initiated turn's events do NOT re-trigger automation unless a rule opts in, and the hard
cap is 3.** Mechanics:

1. `trigger_turn` passes `initiator:"automation"` + `automationDepth = parentDepth + 1` into
   `chat.requestTurn`. The pipeline stamps both on its turn record (turn-path state, like
   `triggeredBy` — NEVER a bus-event field: the D19/D50 allowlist forbids attribution on the public
   bus, and the ChatBusEvent CHECK is frozen).
2. The watcher's fact resolver reads the depth back through one injected narrow op —
   `chat.getTurnOrigin(chatId, ref) → { initiator, automationDepth }` — when resolving turn-scoped
   facts (01 §2's `turn.automationDepth`). Non-turn events triggered by an automation turn's canon
   writes (`messageCommitted` for its reply) resolve depth through the same turn record.
3. The dispatch gate: a rule fires on an event with `automationDepth ≥ 1` only if it sets
   `match_automation_events = true` (per-rule column, default false), and NOTHING fires at
   `automationDepth ≥ 3` (hard cap, not configurable).

WHY this over the alternatives: pure cooldowns still permit slow-burn loops (a 60s-cooldown pair
of rules ping-ponging forever is spend, just polite spend); pure origin-suppression (never
re-trigger) forbids the legitimate bounded chain ("turn completes → rule distills a var → a second
rule reacts once") — the opt-in flag + hard cap allows exactly that, explicitly, and the §3
ceilings remain the belt under it. *(Rejected: loop DETECTION (fire-graph cycle analysis) —
heavier, later, and still needs a depth bound as its backstop; rejected: tagging events on the bus
— unrepresentable by design.)*

## 5. The reserved arms (typed now, refused until their domains land)

| Arm | Schema (reserved) | Claimant | Wire-up when live |
|---|---|---|---|
| `enqueue_crew_workload` | `{ type, member: CrewMemberKind }` | chat-crew-design/05 §a — D46's union "gains ONE reserved-additive member" so power users can author exotic crew triggers; the built-in scheduler remains the normal UX | injected `crew.enqueueMember(chatId, member, origin)`; capability = host + crew enabled on the chat; budget class free (the workload's own single-active + billing governs the spend) |
| `rpg_verb` | `{ type, verb: RpgAutomationVerb /* e.g. "checkpoint" */, args: Record<string,string> }` | rpg-design/09 §b — "a `rpg-verb` action arm (e.g. auto-checkpoint) is reserved-additive" | injected per-verb rpg ops; host + active game required; the verb's own `can()` row applies |
| `force_activate_entries` | `{ type, entryIds: string[] }` | the ST `WORLDINFO_FORCE_ACTIVATE` analog (Core-Legacy-Migration §3 marks it a D46 action, not an event) | needs a per-turn forced-activation seam on GATHER's WI pool; criterion: the first real rule 1.3's constant-entry insert cannot express |

Naming note: RESOLVED — chat-crew-design/05 §a now spells the arm `enqueue_crew_workload`
(snake_case, reconciled 2026-07-01; this union is the arm vocabulary's home). Likewise
rpg-design/09 §b now claims the `rpg_verb` arm by name and owns the `RpgAutomationVerb` vocabulary.
