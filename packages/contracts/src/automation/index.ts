// @orb/contracts/automation — the automation vocabulary. The closed trigger taxonomy + fire-outcome tuple
// (rider slice, so the `@orb/db` CHECKs can derive them), the global-variable plane (02 §4), AND — landed
// with A4 — the action union (03), `LIVE_TRIGGERS` (01 §1), the `TriggerFact` + CEL-env shapes (01 §2 /
// 02 §1), `AutomationOrigin`, and the `AutomationBusEvent` union (04 §5). The trigger id IS the source
// event discriminator — no third event vocabulary. Reserved members are typed-but-refused at `createRule`
// until their domains land.

import type { AutomationRuleId, ChatId, PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { z } from "zod";
import { generateImageActionArgsSchema } from "#imagery";

/** `ChatBusEvent` discriminators automation may trigger on — a subset of the frozen chat-bus union.
 *  The tail after `chatCreated` is reserved (criterion: first real rule request). */
export const CHAT_TRIGGER_TYPES = [
  // v1 (wired)
  "chatOpened",
  "messageCommitted",
  "messageEdited",
  "variantSelected",
  "turnStarted",
  "turnCompleted",
  "turnAborted",
  "worldInfoActivated",
  "personaSwitched",
  "chatCreated",
  "messageHidden",
  "messagesDeleted",
  "chatUpdated",
  "wiEntryAttached",
  "wiEntryDetached",
] as const;
export type ChatTriggerType = (typeof CHAT_TRIGGER_TYPES)[number];

/** `DomainEvent` types automation may trigger on. The crew/rpg members are reserved — they enter
 *  service when their domains land their domain-event mirrors. */
export const DOMAIN_TRIGGER_TYPES = [
  // v1 (wired)
  "character.updated",
  "asset.created",
] as const;
export type DomainTriggerType = (typeof DOMAIN_TRIGGER_TYPES)[number];

/** A rule's trigger: `{bus, type}` where `type` is a member of that bus's source union — no third
 *  vocabulary. The db pairs the two columns with a bus↔tuple CHECK derived from the same tuples. */
export const automationTriggerSchema = z.discriminatedUnion("bus", [
  z.object({ bus: z.literal("chat"), type: z.enum(CHAT_TRIGGER_TYPES) }),
  z.object({ bus: z.literal("domain"), type: z.enum(DOMAIN_TRIGGER_TYPES) }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

/** The two source buses — tied to the trigger union's discriminant. */
export const AUTOMATION_TRIGGER_BUSES = ["chat", "domain"] as const satisfies readonly AutomationTrigger["bus"][];
export type AutomationTriggerBus = (typeof AUTOMATION_TRIGGER_BUSES)[number];

/** Every terminal a dispatch can record for a rule×event: the fire log is the per-hour RATE-cap source
 *  + the host's "why didn't my rule fire" answer + testRun provenance. `budget_refused` = the fire-rate
 *  cap (cooldown / per-rule-hour / per-chat-hour) turned the rule away this event — the rule stays healthy. */
export const AUTOMATION_FIRE_OUTCOMES = [
  "fired",
  "predicate_false",
  "predicate_error",
  "budget_refused",
  "depth_refused",
  "action_error",
  "authority_refused",
  "test_run",
] as const;
export type AutomationFireOutcome = (typeof AUTOMATION_FIRE_OUTCOMES)[number];
export const automationFireOutcomeSchema = z.enum(AUTOMATION_FIRE_OUTCOMES);

// ── the per-user global-variable plane (02 §4) ────────────────────────────────────────────────────
// The KV substrate caps live here (the ONE home) — `@orb/db`'s CHECK-generating DDL imports them so the
// SQL bound and the app-validation bound can never drift. `key` is char-capped; `value` is a string with
// a BYTE cap (JSON-in-a-string for structure) enforced at the verb (SQLite counts chars, the app counts
// bytes — the DDL casts to blob to match).

export const GLOBAL_VARIABLE_KEY_MAX_CHARS = 128;
export const GLOBAL_VARIABLE_VALUE_MAX_BYTES = 65_536; // 64 KiB

export const globalVariableKeySchema = z.string().min(1).max(GLOBAL_VARIABLE_KEY_MAX_CHARS);

/** The settings-page read model for a per-user global variable (the `listGlobalVariables` surface). Never
 *  carries `ownerId` — the plane is single-owned, so a view is always the caller's own. */
export interface GlobalVariableView {
  readonly key: string;
  readonly value: string;
  readonly updatedAt: number;
}

// ── the per-chat rate-cap plane (loop safety) ─────────────────────────────────────────────────────
// The host-editable per-chat FIRE-RATE ceiling — the loop-safety belt that bounds a runaway automation
// (a rule that keeps re-firing) from hammering a paid API. The `automation_budgets` row is born on the
// first `setBudgets` with this default over the DDL; an ABSENT row is dispatched AS this defaulted cap
// (budget-gate reads the DB default for a missing row), so `getBudgets` projecting an absent row to this
// value is the HONEST view. The ONE app-side home for the default: the db DDL mirrors the SAME value (the
// GLOBAL_VARIABLE cap precedent above), the dispatch rate gate imports THIS const. (The per-day $/spend-action
// ceilings were stripped 2026-07-24 — enterprise spend enforcement; cost visibility + rate caps stay.)

/** The per-chat fire-rate ceiling default — the value the write path stamps on a fresh `automation_budgets`
 *  row (mirrored by the `automation_budgets` DDL column default). */
export const AUTOMATION_CHAT_BUDGET_DEFAULTS = {
  maxFiresPerHour: 120,
} as const;

/** The rate-cap panel read model (`getBudgets`) — the host-editable per-chat fire-rate ceiling. An absent
 *  row projects to `AUTOMATION_CHAT_BUDGET_DEFAULTS`. */
export interface BudgetView {
  readonly maxFiresPerHour: number;
}

// ── trigger liveness (01 §1) ────────────────────────────────────────────────────────────────────
/** Which tuple members are LIVE (wired to a handler). `createRule`/`updateRule` refuse a reserved
 *  trigger with `AutomationReservedTriggerError` (a typed, user-visible refusal — not a silent no-op).
 *  A mapped-type `Record` over BOTH trigger tuples: a new tuple member without a liveness entry is a
 *  `tsc` error (the workloads RUNNERS gold standard — core/AGENTS.md §5.5). */
export const LIVE_TRIGGERS = {
  // chat bus — v1 wired
  chatOpened: true,
  messageCommitted: true,
  messageEdited: true,
  variantSelected: true,
  turnStarted: true,
  turnCompleted: true,
  turnAborted: true,
  worldInfoActivated: true,
  personaSwitched: true,
  chatCreated: true,
  // chat bus — reserved (typed, not wired v1)
  messageHidden: false,
  messagesDeleted: false,
  chatUpdated: false,
  wiEntryAttached: false,
  wiEntryDetached: false,
  // domain bus — v1 wired
  "character.updated": true,
  "asset.created": true,
} as const satisfies Record<ChatTriggerType | DomainTriggerType, boolean>;

// ── the action union (03) ───────────────────────────────────────────────────────────────────────
// Every arm: a snake_case `type` discriminator, an inline arg schema, capped rendered outputs. The
// reserved arms (crew/rpg/force-activate) are TYPED but refused by `createRule` until their domains land
// (03 §5). The `generate_image` arm does NOT own its shape — it EXTENDS `@orb/contracts/imagery`'s
// `generateImageActionArgsSchema` (one home per shape — `no-inline-union-redecl`).

/** The closed action-arm discriminators (03 §0). A new arm fails the `ARM_EXECUTORS` mapped-type in the
 *  domain engine (exhaustive-dispatch). */
export const AUTOMATION_ACTION_TYPES = [
  "set_variable",
  "transform_draft",
  "insert_world_info_entry",
  "surface_quick_reply",
  "post_notification",
  "trigger_turn",
  "generate_image",
  "set_chat_background",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

// Rendered/stored bounds (named — `noMagicNumbers`; 03 §1 values).
const VAR_KEY_MAX = 128;
const VAR_VALUE_MAX = 4096;
const TRANSFORM_TEMPLATE_MAX = 8192;
const WI_ENTRY_KEY_MAX = 256;
const WI_KEYS_MAX = 16;
const WI_CONTENT_MAX = 8192;
const QUICK_REPLY_LABEL_MAX = 80;
const QUICK_REPLY_SEND_MAX = 2048;
const QUICK_REPLY_MIN_CHOICES = 1;
const QUICK_REPLY_MAX_CHOICES = 4;
const NOTIFICATION_MESSAGE_MAX = 200;
const GUIDED_TEMPLATE_MAX = 4096;
const AUTOBG_INSTRUCTION_MAX = 512;
/** The ordered action-arm cap (03 §0). A rule carries 1..8 arms. */
export const AUTOMATION_ACTION_ARMS_MIN = 1;
export const AUTOMATION_ACTION_ARMS_MAX = 8;

export const automationActionSchema = z.discriminatedUnion("type", [
  // 1.1 set a chat/global variable (free — no model call).
  z.object({
    type: z.literal("set_variable"),
    scope: z.enum(["chat", "global"]),
    key: z.string().min(1).max(VAR_KEY_MAX),
    op: z.enum(["set", "inc", "dec", "delete"]),
    value: z.string().max(VAR_VALUE_MAX).optional(),
  }),
  // 1.2 run a macro template over the draft (the D50 PromptTransform seam — A7).
  z.object({
    type: z.literal("transform_draft"),
    target: z.enum(["user_input", "assembled_dynamic"]),
    template: z.string().max(TRANSFORM_TEMPLATE_MAX),
  }),
  // 1.3 upsert a world-info entry into a book attached to the rule's chat.
  z.object({
    type: z.literal("insert_world_info_entry"),
    bookId: typeIdSchema(ID_PREFIX.worldBook),
    entryKey: z.string().max(WI_ENTRY_KEY_MAX),
    keys: z.array(z.string()).max(WI_KEYS_MAX),
    contentTemplate: z.string().max(WI_CONTENT_MAX),
    position: z.enum(["before", "after"]).default("before"),
  }),
  // 1.4 surface transient quick-reply chips (rendered at click time as the clicking member's message).
  z.object({
    type: z.literal("surface_quick_reply"),
    choices: z
      .array(z.object({ label: z.string().max(QUICK_REPLY_LABEL_MAX), sendTemplate: z.string().max(QUICK_REPLY_SEND_MAX) }))
      .min(QUICK_REPLY_MIN_CHOICES)
      .max(QUICK_REPLY_MAX_CHOICES),
  }),
  // 1.5 post an inbox notification (host-authored capped string — 03 §1.5 argued exception).
  z.object({
    type: z.literal("post_notification"),
    recipient: z.enum(["host", "all_members"]),
    messageTemplate: z.string().max(NOTIFICATION_MESSAGE_MAX),
  }),
  // 1.6 trigger an autonomous chat turn (SPEND-classed — 03 §1.6).
  z.object({
    type: z.literal("trigger_turn"),
    speakerCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
    guidedTemplate: z.string().max(GUIDED_TEMPLATE_MAX).optional(),
  }),
  // 1.7 generate an image (SPEND-classed). Args home in @orb/contracts/imagery (`no-inline-union-redecl`).
  generateImageActionArgsSchema.extend({ type: z.literal("generate_image") }),
  // 1.8 auto-background (BG-F — ST `/autobg`): an LLM QUIET-pick over the author's owned background library,
  // writing the CHAT background (host-scoped; scope-safe precisely because BG-C's composition rule makes a
  // chat background INERT for every viewer outside a true-solo room). `instruction` optionally biases the
  // pick (macro-rendered). No arg selects a background directly — the pick is the model's, over real names.
  z.object({
    type: z.literal("set_chat_background"),
    instruction: z.string().max(AUTOBG_INSTRUCTION_MAX).optional(),
  }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

/** The stored ordered action list (1..8 arms) — the `automation_rules.actions` json column (04 §1). */
export const automationActionsSchema = z.array(automationActionSchema).min(AUTOMATION_ACTION_ARMS_MIN).max(AUTOMATION_ACTION_ARMS_MAX);

// ── TriggerFact + the CEL activation (01 §2 / 02 §1) ──────────────────────────────────────────────
/** The per-event fact CEL binds as `event` AND the fact a plugin `events.on` handler receives across the
 *  QuickJS realm boundary (plugin-design/01 §2 / 04 §P4). Fields are POPULATED PER TRIGGER TYPE; unpopulated
 *  fields are absent (CEL `has()` guards them; the guest reads them behind `in`/`?.`). All scalars/lists — no
 *  handles, no credentials, no branded ids (the resolver reads only the projections listed here — the D38
 *  re-read discipline applied to automation).
 *
 *  STRUCTURED-CLONE / JSON-Schema CLEAN by construction: every leaf is a plain string / number / null /
 *  string[] — no `.transform()`, no branded-id fields, no functions. A branded id would survive structured-
 *  clone as a bare string but LIE about its type across the realm boundary (the tool-schema-no-branded-
 *  transform lesson applies to guest-marshalled shapes too), so every id — chatId, message.id, characterId,
 *  assetId, worldInfo.entryIds — crosses as an UNBRANDED string. This zod schema IS the guest-marshalling
 *  contract (the membrane may `.parse` a fact before cloning it into the guest); the TS type is DERIVED from
 *  it, one home, the `automationActionSchema` / `pluginManifestSchema` posture — the interface can never drift
 *  from the runtime validator. */
export const triggerFactSchema = z.object({
  type: z.string(),
  bus: z.enum(AUTOMATION_TRIGGER_BUSES),
  chatId: z.string().nullable(),
  // messageCommitted / messageEdited / variantSelected / messageHidden
  message: z
    .object({
      id: z.string(),
      role: z.enum(MESSAGE_ROLES),
      authorUserId: z.string().nullable(),
      characterId: z.string().nullable(),
      seq: z.number(),
      content: z.string(),
    })
    .optional(),
  // turnStarted / turnCompleted / turnAborted
  turn: z
    .object({
      intent: z.string(),
      api: z.string(),
      source: z.string(),
      model: z.string(),
      speakerCharacterId: z.string().nullable(),
      abortReason: z.string().optional(), // turnAborted only
      automationDepth: z.number(), // 0 = human-initiated (03 §4 — the cascade guard reads this)
    })
    .optional(),
  // worldInfoActivated
  worldInfo: z.object({ entryIds: z.array(z.string()).readonly() }).optional(),
  // personaSwitched
  persona: z.object({ from: z.string().nullable(), to: z.string().nullable() }).optional(),
  // domain-bus members
  characterId: z.string().optional(), // character.updated
  assetId: z.string().optional(), // asset.created
});
export type TriggerFact = z.infer<typeof triggerFactSchema>;

/** The CEL activation for a rule predicate (and for `{{expr::…}}` — 02 §3). All values are JSON-safe
 *  scalars/lists/maps; no functions beyond CEL's builtins; no handles. */
export interface AutomationCelEnv {
  /** The resolved TriggerFact — predicate-only; absent under `{{expr::…}}` (no event there). */
  readonly event?: TriggerFact;
  /** The chat's CURRENT runtime variables — the materialized delta-fold cache. Read-only to the PREDICATE/CEL
   *  side, but the dispatch's `set_variable` arm WRITES THROUGH onto this shared map after a chat-scope mutation
   *  (03 §0 / 04 §3 — arms mutate the shared env, order IS semantics): the env is built + cached once per chat
   *  per batch, so a DB-only write would be invisible to later arms + later same-chat rules in the batch. */
  readonly vars: Record<string, string>;
  /** ChoiceBlock config-plane picks, MERGED view (picks ∪ preset defaults). */
  readonly choice: Record<string, string>;
  /** The RULE AUTHOR's per-user global variables (02 §4) — never the triggering member's namespace. */
  readonly global: Record<string, string>;
  /** Narrow chat projections. Deliberately tiny; a predicate needing more is a Tier-2 job. */
  readonly chat: { readonly id: string; readonly messageCount: number };
  /** The injected clock, sampled ONCE per dispatch batch (determinism + no intra-batch skew). */
  readonly now: { readonly epochMs: number; readonly hour: number; readonly dayOfWeek: number };
}

// ── the cascade origin + the automation bus (04 §4 / §5) ──────────────────────────────────────────
/** Turn-path/write origin stamped by an automation-initiated effect: the rule + its cascade depth (03 §4).
 *  NEVER a bus-event field (the D19/D50 allowlist forbids attribution on the public bus). */
export interface AutomationOrigin {
  readonly ruleId: AutomationRuleId;
  readonly automationDepth: number;
}

/** Who SURFACED a member-visible bus emission — a rule (the automation lane) OR a plugin (the membrane's
 *  `chat.quick_reply` capability rides the SAME per-chat bus, plugin-design/01 §1). A discriminated union, NOT a
 *  synthetic rule id: a plugin-surfaced reply has no rule, so the source carries the ACTUAL origin id. Both
 *  emitters + every consumer discriminate on `kind`. */
export type AutomationEmitSource = { kind: "rule"; ruleId: AutomationRuleId } | { kind: "plugin"; pluginId: PluginId };

/** The automation's OWN per-chat SSE feedback bus (04 §5; the rpg/crew precedent — its own bus, NOT the
 *  frozen chat bus). `quickReplySurfaced` is the one MEMBER-visible event (rendered display strings, not
 *  ids — the chips are transient, there is no row to re-read); everything else is host-only + id-only. The
 *  chips can be surfaced by a rule OR a plugin, so `quickReplySurfaced` carries the `AutomationEmitSource`
 *  union (the rest are rule-lifecycle events — rule-only by construction). */
export type AutomationBusEvent =
  | { type: "quickReplySurfaced"; chatId: ChatId; source: AutomationEmitSource; choices: readonly { label: string; sendText: string }[] }
  | { type: "ruleFired"; chatId: ChatId; ruleId: AutomationRuleId }
  | { type: "ruleErrored"; chatId: ChatId; ruleId: AutomationRuleId }
  | { type: "ruleAutoDisabled"; chatId: ChatId; ruleId: AutomationRuleId }
  | { type: "rulesChanged"; chatId: ChatId };
export type AutomationBusEventType = AutomationBusEvent["type"];
