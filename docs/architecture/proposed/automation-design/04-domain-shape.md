# 04 — Domain Shape: Storage, Lifecycle Verbs, the Dispatch Engine, the Bus, and the D50 Seam

> **Status: COMMITTED (D46) — prescriptive design; the ledger D-entry wins on any conflict.**

---

## 1. Storage — DDL intent (`@orb/db/schema/automation.ts`)

```sql
CREATE TABLE automation_rules (
  id            TEXT PRIMARY KEY,             -- TypeID, new prefix: automation_rule
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- the AUTHOR (v1: the host)
  chat_id       TEXT REFERENCES chats(id) ON DELETE CASCADE,            -- NULL = owner-global (BORN, not wired v1 — below)
  name          TEXT NOT NULL,                -- ≤ 120 chars CHECK
  description   TEXT,
  enabled       INTEGER NOT NULL DEFAULT 0,   -- rules are born disabled; enabling is the consent act
  position      INTEGER NOT NULL,             -- explicit order among a chat's rules (list-reorderable)
  trigger_bus   TEXT NOT NULL CHECK (trigger_bus IN ('chat','domain')),
  trigger_type  TEXT NOT NULL,                -- CHECK over the 01 §1 tuples (derived, like chat_events_type_check)
  predicate_cel TEXT,                         -- NULL = always fire; parse-validated at write (02 §1)
  actions       TEXT NOT NULL,                -- json: AutomationAction[] (1..8), zod-validated at write + lazy-parsed at read
  match_automation_events INTEGER NOT NULL DEFAULT 0,   -- the cascade opt-in (03 §4)
  cooldown_seconds   INTEGER NOT NULL DEFAULT 0,
  max_fires_per_hour INTEGER NOT NULL DEFAULT 30,
  consecutive_errors INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,                         -- the last skip reason (host debug surface)
  last_fired_at INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX automation_rules_chat_enabled ON automation_rules(chat_id, enabled, trigger_type);

CREATE TABLE automation_budgets (              -- ONE row per chat with automation (host-editable — 03 §3)
  chat_id                   TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  max_fires_per_hour        INTEGER NOT NULL DEFAULT 120,
  max_spend_actions_per_day INTEGER NOT NULL DEFAULT 10,
  max_usd_per_day           REAL DEFAULT 1.0,  -- NULL = no dollar ceiling (local-only setups)
  usd_spent_today           REAL NOT NULL DEFAULT 0,
  spend_day                 TEXT NOT NULL DEFAULT '',   -- UTC yyyy-mm-dd from the injected clock; reset-on-rollover
  updated_at                INTEGER NOT NULL
);

CREATE TABLE automation_fires (                -- the fire log: audit + budget counting + testRun provenance
  id          TEXT PRIMARY KEY,               -- TypeID, prefix: automation_fire
  rule_id     TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  chat_id     TEXT REFERENCES chats(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  outcome     TEXT NOT NULL CHECK (outcome IN
              ('fired','predicate_false','predicate_error','budget_refused','depth_refused','action_error','authority_refused','test_run')),
  detail      TEXT,                           -- json: per-arm results / the error / the rendered previews (test_run)
  automation_depth INTEGER NOT NULL DEFAULT 0,
  fired_at    INTEGER NOT NULL
);
CREATE INDEX automation_fires_rule_time ON automation_fires(rule_id, fired_at);
```

Decisions in the DDL:

- **`chat_id` is NULLABLE FROM BIRTH; v1 verbs refuse NULL.** An owner-global rule ("on any of my
  chats opening…") is a plausible v2; the column being born nullable makes it additive (the D37
  born-whole posture). LEAN: v1 ships chat-scoped only — resolves when the first real cross-chat
  rule request lands (criterion), at which point the watcher's pre-check Set gains a global-rule
  branch and `trigger` gains chat-less semantics to argue THEN. *(Rejected: chat-scoped NOT NULL —
  a schema migration for a foreseeable widening.)*
- **Actions as ONE json column, not a child table.** Arms are an ordered value-object list with no
  independent identity, never queried individually, and capped at 8; a child table buys FK
  ceremony for rows nothing references. Zod-validated at write; **lazy-parsed at read** with the
  chat-metadata fault-isolation pattern (a corrupt row disables that rule with `last_error`, never
  nukes the chat's rule list).
- **The fire log is a real table, not counters.** It IS the per-hour budget source (`COUNT WHERE
  fired_at > now-1h` on an indexed read), the host's "why didn't my rule fire" answer
  (`outcome`+`detail`), and testRun provenance — three consumers, one table. Reaped by a retention
  sweep (LEAN 30 days / 1000 rows per rule, whichever first).

**ID prefixes added to `@orb/kit/ids`:** `automationRule: "automation_rule"`,
`automationFire: "automation_fire"`. (`global_variables` has no TypeID — 02 §4.)

## 2. Lifecycle verbs (`domain/automation/verbs/`)

All chat-scoped verbs load membership once and gate `can(principal, "host", {kind:"chat", roster})`
— rule authoring IS room authority in v1 (no new action vocab needed; the existing `CHAT_ACTIONS`
axis covers it). Reads for members: `listRules` is host-only in v1 (rules can encode a hidden hand
— the crew-director `audience` lesson; LEAN, criterion: a real member-transparency ask, which would
surface a clamped "N rules active" view, not rule bodies).

```ts
createRule(ctx, p: CreateRuleParams): Promise<RuleView>       // validates trigger liveness (01 §1), CEL parse (02 §1),
                                                              // action schemas + arm caps (03), book attachment (03 §1.3);
                                                              // assigns position = max+1; born disabled
updateRule(ctx, p: UpdateRuleParams): Promise<RuleView>       // same validation; resets consecutive_errors
setRuleEnabled(ctx, { ruleId, enabled }): Promise<void>       // maintains the watcher's chat Set (01 §3)
deleteRule(ctx, { ruleId }): Promise<void>
reorderRules(ctx, { chatId, orderedIds }): Promise<void>      // rewrites position (the ST-familiar drag list)
listRules(ctx, { chatId }): Promise<RuleView[]>
listFires(ctx, { ruleId, limit? }): Promise<FireView[]>       // the debug surface
setBudgets(ctx, p: SetBudgetsParams): Promise<void>           // upserts automation_budgets
testRule(ctx, { ruleId, sampleEvent }): Promise<TestRunResult>
```

**`testRule` — the dry-run contract:** builds a `TriggerFact` from a host-supplied sample (or the
chat's most recent matching fire), evaluates the predicate, renders every arm's templates, and
returns `{ predicate: boolean | {error}, arms: {type, renderedPreview | error}[] }` — **executing
NOTHING** (no ops called, no budget debit) and logging an `outcome:"test_run"` fire row. WHY
render-but-don't-execute: template bugs are the dominant authoring failure and are invisible
without a renderer; executing would make "test" a spend button. *(Rejected: a full sandbox
execution mode — that's Tier-2's inline snippet, not a rule tester.)*

## 3. The dispatch engine (`domain/automation/engine/dispatch.ts`)

Per event, after the watcher pre-check + fact resolution (01 §3):

```
rules = load enabled rules (chat_id, trigger_type)  ORDER BY position ASC, created_at ASC
for each rule (SEQUENTIALLY — arms mutate the shared variable env; order is semantics):
  1. depth gate      — fact.automationDepth ≥ 1 && !rule.match_automation_events → record depth_refused? NO —
                       record NOTHING (default-suppressed events would flood the log); ≥1 with opt-in but ≥3 → depth_refused
  2. authority gate  — author still holds host on the chat (03 §2) → else authority_refused
  3. budget gate     — per-rule cooldown + per-rule/hour + per-chat/hour (+ spend gates deferred to the arm) → budget_refused
  4. predicate       — CEL over {event: fact, …} (02 §1) → false ⇒ predicate_false (recorded only when
                       the rule has fired before — first-match debugging — LEAN; else skipped silently)
  5. arms            — sequential; each renders templates then calls its injected op; first failure
                       aborts remaining arms → action_error with the arm index in detail
  6. record          — automation_fires row + lastFiredAt + emit ruleFired on the automation bus
```

**Error isolation:** every rule body is try/caught independently; a throwing rule never affects
sibling rules, the watcher loop, or the turn (the handler is already fire-and-forget off the bus).
`consecutive_errors` increments on `predicate_error`/`action_error`, resets on a clean fire, and
auto-disables at 20 (02 §1) with a `ruleAutoDisabled` bus event + an `automation-notice`
notification to the author.

**Ordering decision:** explicit `position` (host-reorderable), NOT priority numbers or creation
order alone. WHY: ST users reason about rule lists positionally (Quick Reply sets are ordered
lists); an implicit order becomes load-bearing the first time two rules touch the same variable.
*(Rejected: a `priority` int with ties — position is a total order by construction.)*

## 4. The 8-slot layout (`domain/automation/`)

```
domain/automation/
├── index.ts            FRONT DOOR — AutomationService interface + factory
├── service.ts          COMPOSITION ROOT — zero logic
├── context.ts          DI BUNDLE — { db, clock, prng, can, rateLimit, ops: AutomationOps, log }
├── contract/
│   ├── service.ts      AutomationService (the verbs above + handleEvent)
│   ├── params.ts       Create/Update/SetBudgets/TestRule params
│   ├── results.ts      RuleView · FireView · TestRunResult
│   ├── errors.ts       AutomationReservedTriggerError · RuleValidationError · RuleNotFoundError
│   └── ops.ts          AutomationOps — the injected cross-feature op TYPES (below)
├── verbs/              one verb per file (§2) + handle-event.ts
├── persistence/        rules.ts · budgets.ts · fires.ts · global-variables.ts (queries only)
├── substrate/          cel-env.ts (02 §1) · fact-resolver.ts (01 §2) · action-schemas.ts · caps.ts
├── watcher/            NAMED SUBSYSTEM — start-automation-watcher.ts (01 §3)
└── engine/             NAMED SUBSYSTEM — dispatch.ts (§3) · budget-gate.ts · arm-executors.ts
                        (ARM_EXECUTORS: { [K in AutomationActionType]: ArmExecutor<K> } — the
                        RUNNERS mapped-type gold standard; reserved arms map to a typed refusal)
```

```ts
/** contract/ops.ts — every cross-feature dependency as an injected TYPE (domain-no-cross-feature);
 *  wired at entry/compose. Reserved arms' ops are optional — absent until their domains land. */
export interface AutomationOps {
  chat: {
    applyVariableOps(chatId: ChatId, ops: readonly VariableOp[], origin: AutomationOrigin): Promise<void>;
    requestTurn(chatId: ChatId, p: AutomationTurnRequest): Promise<{ costUsd: number | null }>;
    getTurnOrigin(chatId: ChatId, ref: TurnRef): Promise<{ initiator: TurnInitiator; automationDepth: number }>;
    readVariables(chatId: ChatId): Promise<Record<string, string>>;          // the fold cache (CEL env)
    readChoicePicks(chatId: ChatId): Promise<Record<string, string>>;        // merged view
    getMessageFact(chatId: ChatId, messageId: MessageId): Promise<TriggerFact["message"]>;
  };
  worldInfo: { upsertEntries(bookId: WorldBookId, entries: readonly RuleEntryUpsert[], origin: AutomationOrigin): Promise<void> };
  notifications: { emit(e: NotificationEvent): void };
  imagery: { generatePicture(p: GeneratePictureParams): Promise<GeneratedPicture> };
  crew?: { enqueueMember(chatId: ChatId, member: string, origin: AutomationOrigin): Promise<void> };   // reserved
  rpg?: Record<string, never>;                                                                          // reserved (09b shape TBD by rpg)
}
```

`@orb/contracts/automation` holds: the trigger tuples + schema (01 §1), the action union (03), the
CEL-env + TriggerFact types (01 §2/02 §1), `AutomationOrigin { ruleId, automationDepth }`, and the
`AutomationBusEvent` union (§5) — the cross-boundary wire; RuleView/FireView stay in the domain
contract until the Phase-6 client type-imports them (the AdminUserView precedent).

## 5. The automation bus (client feedback — the rpg/crew precedent)

Own per-chat SSE bus (`@orb/kit/replay-buffer`, `ASSUMES(single-replica)`), fanned out by tRPC
`automation.stream(chatId)`; ONE procedure projecting by caller authority (the crew host/member
filter pattern — chat-crew-design/04 §4). WHY not the chat bus: frozen CHECK + different consumer
surface (D50; the exact reason rpg and crew grew their own).

```ts
export type AutomationBusEvent =
  | { type: "quickReplySurfaced"; chatId: ChatId; ruleId: AutomationRuleId;
      choices: readonly { label: string; sendText: string }[] }               // MEMBER stream (the one room-visible event)
  | { type: "ruleFired"; chatId: ChatId; ruleId: AutomationRuleId }           // host only
  | { type: "ruleErrored"; chatId: ChatId; ruleId: AutomationRuleId }         // host only
  | { type: "ruleAutoDisabled"; chatId: ChatId; ruleId: AutomationRuleId }    // host only
  | { type: "rulesChanged"; chatId: ChatId };                                 // host only (config refetch)
```

`quickReplySurfaced` carries rendered display strings (not ids — there is no row to re-read; the
chips are transient by design, 03 §1.4). Everything else is id-only (D38 discipline).

## 6. The D50 `PromptTransform` seam (the one synchronous hook — spec'd here, BUILT WITH CHAT)

D50's ruling: ST's mutable-prompt interceptor cluster must never be modeled as bus events; "if a
synchronous transform is ever wanted it is an ordered `PromptTransform` step on the turn pipeline,
built WITH chat." This is that spec. The interface lives in `@orb/contracts/chat` (chat owns its
pipeline's extension point); automation and the plugin host are its only two REGISTRARS.

```ts
/** An ordered, bounded, synchronous-per-call transform over a turn's draft text. Registered at
 *  entry/compose into the pipeline's transform list; the pipeline applies them at exactly TWO
 *  fixed points (never anywhere else):
 *    "user_input"        — SEND, after the macro pass, before USER_INPUT regex
 *    "assembled_dynamic" — end of BUILD, over the dynamic half only (the static half is
 *                          untransformable — 03 §1.2's cache argument)                       */
export interface PromptTransform {
  readonly id: string;                       // "automation:<ruleId>" | "plugin:<slug>:<name>"
  readonly point: "user_input" | "assembled_dynamic";
  readonly order: number;                    // ascending; automation registers 0-999, plugins 1000+
  apply(draft: string, env: PromptTransformEnv): Promise<string>;   // deadline-bounded by the CALLER
}
export interface PromptTransformEnv {
  readonly chatId: ChatId;
  readonly vars: Record<string, string>;     // read-only snapshot; mutation goes through actions, not transforms
}
```

Pipeline rules (chat-side, enforced by chat's tests): transforms apply in `order`; each call is
awaited with a **250 ms deadline** (LEAN — the plugin bridge is async by nature, plugin-design/03);
a timeout or throw SKIPS that transform (draft unchanged) + emits a `warning` bus event — a broken
transform never eats a turn (D53). The list is compose-time-static per deploy for plugins;
automation's `transform_draft` rules register/deregister through a compose-wired registrar as rules
are enabled/disabled. **Order split decision:** automation before plugins (0-999 / 1000+). WHY:
declarative host-authored rules are the room's policy; a plugin is a guest — policy wraps guest,
not vice versa. *(Rejected: interleaved user-defined ordering across the two sources — a
cross-system total order is config surface nobody asked for; the split is legible.)*

Chat's own SEND/BUILD stages are NOT transforms (they are the pipeline); regex placements are NOT
transforms (they have their own committed engine + ordering, D53). The seam exists so nothing else
ever needs to touch the pipeline.
