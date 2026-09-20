// @orb/contracts/automation — the automation vocabulary: the closed trigger taxonomy + fire-outcome tuple
// (rider slice, so the `@orb/db` CHECKs can derive them), the global-variable plane, the action union,
// `LIVE_TRIGGERS`, the `TriggerFact` + CEL-env shapes, `AutomationOrigin`, and the `AutomationBusEvent`
// union. The trigger id IS the source event discriminator — no third event vocabulary. Reserved members
// are typed-but-refused at `createRule` until their domains land.

import type { AutomationRuleId, AutomationSuggestionId, ChatId, PluginId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { ENTRY_POSITIONS } from "@orb/kit/world-info";
import { z } from "zod";
import type { ChatBusEvent } from "#chat";
import { PROMPT_TRANSFORM_POINTS } from "#chat";
import type { DomainEventType } from "#events";
import { generateImageActionArgsSchema } from "#imagery";
import { NOTIFICATION_RECIPIENTS } from "#notifications";

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
  // S7 (wired with B6) — a member reacted to a reply. The one trigger whose fact is a HUMAN's in-room signal
  // rather than a turn or a config edit, which is what the graveyard's reaction-heat shapes were waiting on;
  // its fact carries the emoji and the add/remove direction, so a predicate can select on both.
  "reactionsChanged",
  "messageHidden",
  "messagesDeleted",
  "chatUpdated",
  "wiEntryAttached",
  "wiEntryDetached",
] as const satisfies readonly ChatBusEvent["type"][];
export type ChatTriggerType = (typeof CHAT_TRIGGER_TYPES)[number];

/** `DomainEvent` types automation may trigger on. The agents/rpg members are reserved — they enter
 *  service when their domains land their domain-event mirrors.
 *
 *  IT CARRIES ALL FOUR LIVE DOMAIN EVENTS (S7, landed with C5). It carried two until then, while the source
 *  bus had four — `persona.updated` and `world-info.updated` grew it on 2026-08-14 for the entity→room
 *  freshness bridge and the trigger tuple never caught up, so the vocabulary was two members BEHIND its own
 *  source union. The catch-up is BATCHED into the owner-global lane's merge window rather than landed alone,
 *  because every member of this tuple is paired with the `automation_rules` bus↔type CHECK, which is
 *  tuple-DERIVED DDL — so any widening here is a generated-baseline edit (`db/schema/automation.ts`). An
 *  event that exists on no bus is NOT vocabulary: the `crew.*`/`rpg.*` mirrors stay documented in
 *  `@orb/contracts/events`'s own header, never tupled here. */
export const DOMAIN_TRIGGER_TYPES = [
  // v1 (wired)
  "character.updated",
  "asset.created",
  // S7 (wired with C5) — the entity→room freshness bridge's two events, now trigger vocabulary.
  "persona.updated",
  "world-info.updated",
] as const satisfies readonly DomainEventType[];
export type DomainTriggerType = (typeof DOMAIN_TRIGGER_TYPES)[number];

/** A rule's trigger: `{bus, type}` where `type` is a member of that bus's source union — no third
 *  vocabulary. The db pairs the two columns with a bus↔tuple CHECK derived from the same tuples. */
export const automationTriggerSchema = z.discriminatedUnion("bus", [
  z.object({ bus: z.literal("chat"), type: z.enum(CHAT_TRIGGER_TYPES) }),
  z.object({ bus: z.literal("domain"), type: z.enum(DOMAIN_TRIGGER_TYPES) }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

/** The two trigger tuples as MEMBERSHIP sets — the one mechanism every bus classification reads.
 *  Built once at module load; the tuples are `as const`, so a widening is a tuple edit and nothing else. */
const CHAT_TRIGGER_SET: ReadonlySet<string> = new Set(CHAT_TRIGGER_TYPES);
const DOMAIN_TRIGGER_SET: ReadonlySet<string> = new Set(DOMAIN_TRIGGER_TYPES);

/** WHICH BUS an event type is trigger vocabulary on — `null` when it is on NEITHER tuple (a bus member
 *  automation does not trigger on: a `delta`/`warning` chat beat, a `crew.*`/`rpg.*` domain mirror).
 *
 *  IT IS TUPLE MEMBERSHIP, NEVER PUNCTUATION (#1433). Both this and the watcher front door previously
 *  classified by "does the type contain a dot", which is a property of today's NAMES rather than of the
 *  taxonomy: nothing makes every `DomainEventType` dot-namespaced or forbids a `ChatBusEvent` from carrying a
 *  dot, so a future member of either union would silently route through the WRONG pre-check and rule loader
 *  while sitting correctly in the trigger map. The tuples above are the authority the db's bus↔type CHECK is
 *  generated from; reading them is the only classification that cannot drift from what a rule can store.
 *
 *  The two tuples are DISJOINT — pinned in `tests/contracts/automation/index.contract.test.ts`, because
 *  membership order would otherwise decide a shared member's bus silently. */
export function triggerBusOf(type: string): AutomationTriggerBus | null {
  if (CHAT_TRIGGER_SET.has(type)) {
    return "chat";
  }
  return DOMAIN_TRIGGER_SET.has(type) ? "domain" : null;
}

/** The `AutomationTrigger` for one trigger TYPE — the bus DERIVED from which tuple the member belongs to.
 *
 *  ONE HOME FOR THE PAIRING (C5). The db binds `trigger_bus` to `trigger_type` with a CHECK generated from
 *  these same two tuples, so any producer that spells the pair by hand can spell it wrong and only discover
 *  it at the insert. Preset defs name a TYPE and let this answer for the bus, which makes a cross-bus pair
 *  unrepresentable rather than merely refused.
 *
 *  Closed input, total answer: the parameter is the union of both tuples, so {@link triggerBusOf} cannot
 *  return `null` here and the `domain` test is the whole branch. */
export function automationTriggerFor(type: ChatTriggerType | DomainTriggerType): AutomationTrigger {
  return triggerBusOf(type) === "domain" ? { bus: "domain", type: type as DomainTriggerType } : { bus: "chat", type: type as ChatTriggerType };
}

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

/** The `automation.listFires` fire-log page CEILING, enforced at the transport trust boundary (the
 *  `CHARACTER_LIST_MAX_LIMIT` precedent) — the host-only debug surface is a growing per-rule catalog, so an
 *  over-bound ask is a BAD_REQUEST rather than an unbounded log fetch. */
export const AUTOMATION_FIRES_LIST_MAX_LIMIT = 200;

// ── the per-user global-variable plane ────────────────────────────────────────────────────────────
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

/** The CEILING on either rate-cap belt — the per-chat one and its per-owner twin (#1430).
 *
 *  A BELT NEEDS A TOP OR IT IS NOT A BELT. The per-RULE cap is 0..240 (`substrate/validate.ts`), and the two
 *  budget planes had no upper bound at all: the wire took `int().min(0)` and the verbs took whatever arrived,
 *  so a host could set a nine-digit ceiling and the loop-safety belt would bound nothing while still reading
 *  as configured. 3600 = one fire per second, the rate past which "cap" stops describing anything a runaway
 *  rule could be held to — well above the 120 default and above any plausible sum of a room's per-rule caps.
 *
 *  ONE HOME, TWO ENFORCERS (the `AUTOMATION_VARIABLE_VALUE_MAX` posture): the domain verbs
 *  (`setBudgets`/`setOwnerBudgets`) hold the AUTHORITATIVE bound — they are reachable from compose without the
 *  transport — and the tRPC input schema mirrors it so an over-bound ask is a BAD_REQUEST at the trust
 *  boundary rather than a domain throw. */
export const AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR = 3600;

/** The rate-cap panel read model (`getBudgets`) — the host-editable per-chat fire-rate ceiling. An absent
 *  row projects to `AUTOMATION_CHAT_BUDGET_DEFAULTS`. */
export interface BudgetView {
  readonly maxFiresPerHour: number;
}

// ── C5: the per-OWNER rate-cap plane (the owner-global lane's loop-safety belt) ────────────────────
// The chat-scoped belt above cannot express a global rule's ceiling, and that is a schema fact rather
// than an oversight: `automation_budgets`'s primary key IS `chat_id`, so a NULL-scope row is
// unrepresentable (SQLite PKs cannot be NULL, and a synthetic sentinel key is the D24 class the ledger
// forbids). A global rule therefore counts against a SIBLING owner-keyed table
// (`automation_owner_budgets`), and the dispatch reads whichever belt matches the rule's own scope.
//
// WHY A GLOBAL RULE NEEDS ITS OWN BELT AT ALL: the per-rule/hour cap still applies to it, but the SECOND
// belt — the one that bounds a whole scope rather than one rule — has no chat to key on. Without this
// table a runaway global rule multiplies by the owner's entire library instead of by one room, which is
// exactly the hammering the belt exists to bound. It is a runaway-loop belt and NOT a spend ceiling: the
// per-day $ ceilings were stripped 2026-07-24 and nothing here re-introduces them.

/** The per-OWNER fire-rate ceiling default — the value the write path stamps on a fresh
 *  `automation_owner_budgets` row (mirrored by that table's DDL column default, the
 *  `AUTOMATION_CHAT_BUDGET_DEFAULTS` posture: ONE app-side home, the DDL derives it).
 *
 *  It is the SAME 120 as the per-chat cap, and that is a decision rather than a copy: an owner-global rule
 *  fires on DOMAIN events (a card import, a book edit) — bursty but human-paced — so the honest starting
 *  ceiling is the one the per-chat belt already proved liveable, and the host raises it from the pane. */
export const AUTOMATION_OWNER_BUDGET_DEFAULTS = {
  maxFiresPerHour: 120,
} as const;

/** The owner-global rate-cap read model (`getOwnerBudgets`) — the caller's own ceiling. Carries no
 *  `ownerId`: the plane is single-owned, so a view is always the caller's own (the `GlobalVariableView`
 *  posture). Structurally identical to {@link BudgetView} today and DELIBERATELY NOT an alias of it: the
 *  two are different planes with different write gates (a chat's HOST edits one, the OWNER edits the
 *  other), and collapsing them would make the next field added to either silently appear on both. */
export interface OwnerBudgetView {
  readonly maxFiresPerHour: number;
}

// ── trigger liveness ───────────────────────────────────────────────────────────────────────────
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
  // chat bus — S7 (wired with B6): the reaction plane emits it and the fact resolver projects it, so it is
  // LIVE, not reserved.
  reactionsChanged: true,
  // chat bus — reserved (typed, not wired v1)
  messageHidden: false,
  messagesDeleted: false,
  chatUpdated: false,
  wiEntryAttached: false,
  wiEntryDetached: false,
  // domain bus — v1 wired
  "character.updated": true,
  "asset.created": true,
  // domain bus — S7 (wired with C5): both are LIVE on the domain bus and both resolve a fact
  // (`substrate/fact-resolver.ts`), so neither is reserved.
  "persona.updated": true,
  "world-info.updated": true,
} as const satisfies Record<ChatTriggerType | DomainTriggerType, boolean>;

// ── the action union ─────────────────────────────────────────────────────────────────────────────
// Every arm: a snake_case `type` discriminator, an inline arg schema, capped rendered outputs. Additional
// arms for purged domains (agents/rpg/force-activate) are not typed here today — the rebuild mints them onto
// `AUTOMATION_ACTION_TYPES` if those domains return. The `generate_image` arm does NOT own its shape — it
// EXTENDS `@orb/contracts/imagery`'s `generateImageActionArgsSchema` (one home per shape —
// `no-inline-union-redecl`).

/** The closed action-arm discriminators. A new arm fails the `ARM_EXECUTORS` mapped-type in the
 *  domain engine (exhaustive-dispatch).
 *
 *  `run_tool` is D146 clause (a) made concrete, and it is the reason that clause exists: a PLUGIN extends what
 *  automation can DO without this tuple growing per contributor. The union member is FIRST-PARTY and
 *  `tsc`-forced like every other member; the open-world contributor name rides INSIDE its payload
 *  (`run_tool.name`). Adding an open arm — a `type: string` escape, a `plugin_*` wildcard member — is the
 *  banned move: it defeats every exhaustive dispatch downstream (core/AGENTS.md §5.5). */
/** C5 — the SCOPE an arm needs from the rule that carries it. A rule is `chatId: ChatId | null` and NULL
 *  means owner-global (`db/schema/automation.ts`), so half the arm surface has no room to act in. */
export const AUTOMATION_ARM_SCOPES = ["chat-required", "chat-independent"] as const;
export type AutomationArmScope = (typeof AUTOMATION_ARM_SCOPES)[number];

/** THE VARIABLE PLANE an arm writes: the room's own runtime fold, or the AUTHOR's per-user globals. Two arms
 *  name it (`set_variable.scope`, `run_tool.resultScope`) and both must mean the same thing by it.
 *
 *  IT IS A DIFFERENT AXIS FROM `RULE_PRESET_SCOPES`, which happens to share its members, and homing it
 *  separately is the point rather than an accident: one answers "which KV store does this write land in", the
 *  other "which lane does this rule live on". They are equal today by coincidence — a third variable plane
 *  would grow this tuple and must NOT grow that one — so deriving either from the other would couple two
 *  unrelated vocabularies through their current spelling. (Homed at C5 because the collision only became
 *  visible once the preset-scope tuple existed to collide with.) */
export const AUTOMATION_VARIABLE_SCOPES = ["chat", "global"] as const;
export type AutomationVariableScope = (typeof AUTOMATION_VARIABLE_SCOPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  "set_variable",
  "transform_draft",
  "insert_world_info_entry",
  "surface_quick_reply",
  "post_notification",
  "trigger_turn",
  "generate_image",
  "set_chat_background",
  // S5 — the quiet-analysis arm (C1). Placed BEFORE `run_tool` deliberately: it is a first-party model-lane
  // arm and `run_tool` stays the tuple's closing closed/open BOUNDARY member (the D146-a comment below).
  // The tuple position is also the arm-vocabulary display order (`rule-copy.ts::ARM_LABELS` derives it).
  "run_analysis",
  "run_tool",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

/** C5 — WHICH ARMS NEED A ROOM. The exhaustive `Record<AutomationActionType, AutomationArmScope>` the scope
 *  axis is decided by: a new arm fails `tsc` here until it declares, so "can this act happen with no chat?"
 *  can never be answered by omission. The domain's mint validation reads THIS and nothing else for the
 *  per-TYPE half of the question (`domain/automation/substrate/validate.ts`).
 *
 *  EVERY `chat-required` ROW IS A CODE FACT, not a judgment call — each names the thing that would be
 *  `undefined` without a chat:
 *   • `surface_quick_reply` — the chips ride the per-CHAT automation bus (`quickReplySurfaced.chatId`).
 *   • `trigger_turn` — a turn happens IN a room (`AutomationTurnRequest.chatId`).
 *   • `set_chat_background` — the written background is the CHAT's carried one (BG-C/BG-F).
 *   • `transform_draft` — it rewrites a turn's draft, and a turn is a room's.
 *   • `post_notification` — the `automation-notice` wire member's `chatId` is REQUIRED
 *     (`@orb/contracts/notifications`) AND its recipients are resolved over the chat's present members.
 *   • `run_analysis` — every read window it thinks over is a chat-scoped canon read.
 *  The last two are NOT in the interaction-direction spec §3-S3's enumerated list; that list is a subset of
 *  what the built code requires, and this Record is the corrected home (both rows carry their receipt above).
 *
 *  `generate_image` IS `chat-independent`, and that is C5's own flip rather than an as-built reading: the
 *  request's `chatId` widened to nullable with this landing so the owner-global lane's living-library preset
 *  is admissible at all. It is admissible NARROWLY — a global `generate_image` must be `quiet` (a non-quiet
 *  generation POSTS into a chat) and must ride a caption mode (the text-EXTRACTION modes read a chat's recent
 *  canon through the quiet shaper). Both refinements are the domain's, beside the two per-arm PLANE
 *  refinements this per-TYPE Record structurally cannot express: `set_variable.scope` and
 *  `run_tool.resultScope` may name the `chat` plane, which is a room's variable fold.
 *
 *  THE KEYS ARE BRACKETED (`["set_variable"]:`) for the reason `IMAGERY_CAPTION_SLOT_IDS` is
 *  (`@orb/contracts/imagery`): the arm vocabulary is snake_case WIRE data, and a bare snake_case PROPERTY
 *  name trips `useNamingConvention` — a computed string key is DATA and does not, so this Record needs no
 *  suppression. The `Record<…>` ANNOTATION (not `satisfies`) is the exhaustiveness pin: a missing arm and an
 *  unknown arm are both `tsc` errors, which is the whole enforcement this axis claims. */
export const AUTOMATION_ARM_SCOPE: Record<AutomationActionType, AutomationArmScope> = {
  ["set_variable"]: "chat-independent",
  ["transform_draft"]: "chat-required",
  ["insert_world_info_entry"]: "chat-independent",
  ["surface_quick_reply"]: "chat-required",
  ["post_notification"]: "chat-required",
  ["trigger_turn"]: "chat-required",
  ["generate_image"]: "chat-independent",
  ["set_chat_background"]: "chat-required",
  ["run_analysis"]: "chat-required",
  ["run_tool"]: "chat-independent",
};

// Rendered/stored bounds (named — `noMagicNumbers`).
const VAR_KEY_MAX = 128;
/** The chat/global variable VALUE bound, in characters. ONE home, TWO enforcers: the `set_variable` arm's
 *  authoring cap (its `value` is a template a human wrote), and the `run_tool` arm's CAPTURE truncation, where
 *  the bound stops being cosmetic — a captured tool result is a CONTRIBUTOR's bytes, and the variable plane is
 *  a small KV that rides the CEL env into every later predicate and every later template render on that chat,
 *  not a document store. Exported for that second enforcer (the arm executor truncates to it). */
export const AUTOMATION_VARIABLE_VALUE_MAX = 4096;
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
/** The `run_tool` arm's tool-NAME cap. LENGTH only, deliberately: the authoritative name contract is the
 *  registry's own charset (`TOOL_NAME_RE`, `domain/tool-use/contract/params.ts` — the OpenAI-function ∩
 *  MCP-tool intersection), and a rule's name is checked against the LIVE REGISTRY at mint by the automation
 *  domain's `substrate/validate.ts`, which is a stronger test than any regex re-spelling here. Re-declaring it
 *  in `contracts` would be a second home for one shape (§5.4) that could drift from the registry it describes;
 *  the cap is here only so an oversized string cannot be stored. 64 = the registry charset's own bound. */
const TOOL_NAME_MAX = 64;
/** The `run_tool` arm's rendered-args cap. Sized to `TRANSFORM_TEMPLATE_MAX`'s class: the template renders to a
 *  JSON document a guest tool's lifted zod schema then parses, so the bound is "a config-authored argument
 *  object", not a prompt. */
const TOOL_ARGS_TEMPLATE_MAX = 8192;
/** The ordered action-arm cap. A rule carries 1..8 arms. */
export const AUTOMATION_ACTION_ARMS_MIN = 1;
export const AUTOMATION_ACTION_ARMS_MAX = 8;

/** S5 — the `run_analysis` arm's stored-GUIDANCE cap, in characters. ONE home, TWO enforcers (the
 *  `GLOBAL_VARIABLE_*` pattern above): the analysis applier SLICES the model's guidance to this bound at the
 *  write boundary, and the `automation_rule_state.guidance` DDL CHECK mirrors the same value — so the app
 *  bound and the SQL bound can never drift. Sized to the steer-line class (a guidance line is ONE concrete
 *  narrator instruction — the legacy director's contract — not a document). */
export const ANALYSIS_GUIDANCE_MAX = 600;
/** The `run_analysis` arm's authored TASK BRIEF cap — a paragraph-class instruction (the `LORE_NOTE` class),
 *  not the 8 KiB template ceiling: the brief rides every pass's prompt, so its bound is a prompt budget. */
const ANALYSIS_BRIEF_MAX = 2000;
/** The host's standing STEER knob cap — one steer-line-class sentence rides every pass. */
const ANALYSIS_STEER_MAX = 600;
/** S5 — a route's APPLY posture: `direct` executes at fire time; `confirm` raises an S4 card and executes
 *  only on the host's yes. Declared ONCE as a tuple and derived (§5.5 — no inline union re-spell). */
export const ANALYSIS_APPLY_MODES = ["direct", "confirm"] as const;
/** S5 — the `setVariable` route's NUMERIC-SCORE value contract: the ONLY shape an analysis pass may publish
 *  into the member-visible chat-vars plane (the needle, catalogue #16 — F6's single ruled exception). The
 *  applier writes `String(clamp(int(score), 0..ANALYSIS_SCORE_MAX))` and NOTHING ELSE — arcs, twists and
 *  guidance are disjoint payload fields no code path hands to the vars writer. */
export const ANALYSIS_SCORE_MAX = 10;
/** S5/C3 — the prose-audit route's REWRITE body cap, in characters. It bounds three things at once and they
 *  must agree: the model's emitted `rewrite.text`, the before/after strings the host-only card event carries
 *  for its diff, and the content the confirmed apply writes into a message variant. Sized to a long RP reply
 *  (the class `WI_CONTENT_MAX` is sized for) rather than a document — a rewrite that would not fit was never a
 *  conservative repair of one reply. */
export const ANALYSIS_REWRITE_MAX = 8000;
/** S5/C3 — the one-phrase FLAW the audit names on the card ("contradicts the locked door", "speaks for Mira").
 *  Summary-class: it rides `AUTOMATION_SUGGESTION_SUMMARY_MAX` after the question wrapper. */
export const ANALYSIS_REWRITE_ISSUE_MAX = 120;
/** §4 #16 (the needle) — the ONE chat variable the tension score publishes into, shared by the preset that
 *  authors the `vars` route and the client meter that renders it.
 *
 *  IT LIVES IN `contracts` FOR THE SAME REASON EVERY WIRE SHAPE DOES: two packages must agree on it and
 *  neither may re-spell it. The remaining preset variable keys (`debt`, `lastBeatMs`) are domain-local
 *  constants because nothing outside the server reads them yet; this one and the clock pair below are read by
 *  a client surface, so a server-side literal would make the client's own literal the second home of one
 *  name. It is a CONSTANT and never a knob for the reason `contract/presets.ts` states: a knob-supplied key is
 *  interpolated into a CEL IDENTIFIER position (`has(vars.<k>)`), which is both an injection surface and a
 *  value the meter would have no way to learn. */
export const NEEDLE_TENSION_VAR_KEY = "tension";

/** §4 #7 (the clock, `clockFires`) — the pair of chat variables B9's `SegmentedClock` flank widget renders:
 *  the current FILL and the threshold it fills TO. Both live in `contracts` for the `NEEDLE_TENSION_VAR_KEY`
 *  reason: the clock preset AUTHORS them into the member-visible `vars` plane (R1 increments the fill and
 *  publishes the max, both free `set_variable` arms) and the client meter READS them back through
 *  `chat.getRuntimeVariables`, so the two packages must agree on one spelling.
 *
 *  WHY THE MAX IS A PUBLISHED VARIABLE and not read from the rule: the threshold is a mint-time knob that
 *  lands as a LITERAL inside R2's CEL predicate (`int(vars.clock) >= N`), which no member-visible read exposes
 *  and which the client may not re-derive (a predicate is server logic — `contract/presets.ts`). Publishing N
 *  as a sibling variable is the correct home: the data the widget needs comes from the plane it already
 *  reads, member-gated exactly like the fill. Both are CONSTANTS, never knobs, for the CEL-identifier reason
 *  above. */
export const CLOCK_VAR_KEY = "clock";
export const CLOCK_MAX_VAR_KEY = "clockMax";

/** How a surfaced chip's text is CONSUMED when the member clicks it (S1, the in-chat control seam):
 *  `send` fires it as that member's next turn immediately; `compose` seeds their composer draft so they
 *  own and edit it before sending. The pair is the wire half of the client's control-mode axis (the
 *  client's `CHAT_CONTROL_MODES` derives from this tuple and adds `execute`, which no chip can carry — an
 *  arm-surfaced control never runs a verb). WHY the field exists: the authoring law "chip text is diegetic
 *  or compose-mode, never member-attributed director voice" has no lever without it; before it, send-vs-
 *  compose was a per-chat GAME knob (`cyoaChoiceBehavior`) that the `:::choices` fence renderer reads and
 *  a rule-surfaced chip has no access to. */
export const QUICK_REPLY_MODES = ["send", "compose"] as const;
export type QuickReplyMode = (typeof QUICK_REPLY_MODES)[number];

/** S4 — the arms that COST something to run: a model call the rule author funds. The machine-readable spend
 *  set the fire-rate REFUSAL path reads (interaction-direction-spec §3-S4 / RULED F4: a `budget_refused` on a
 *  rule carrying one of these raises the "rate-capped — run it now?" invitation, ON by default). Until now the
 *  class existed only as the words "SPEND-classed" in two arm comments. The tuple is exact-as-built, never
 *  forward-declared: `run_tool` joined at C4 and `run_analysis` at C1, each riding its own landing.
 *
 *  NOT the same axis as the CONFIRM-FIRST (suggestible) set below: SPEND is about who pays and therefore what
 *  a rate refusal may offer to re-run; suggestible is about CONSENT — which arms a host may be asked to
 *  approve before they act. `set_chat_background` is suggestible and not spend-classed for exactly that
 *  reason (its quiet pick is cheap, but it changes what the room LOOKS like).
 *
 *  `run_tool` is spend-classed CONSERVATIVELY and that is the honest reading, not a guess: the arm hands control
 *  to a contributor's own code, and the capabilities a plugin can hold include `llm.quiet` (a model call on the
 *  installer's connection), `net.fetch`, and image generation. The host therefore gets F4's "rate-capped — run
 *  it now?" invitation when a run_tool rule is turned away by the fire-rate cap, which is the correct offer:
 *  the money at stake is the author's own. */
export const SPEND_ARM_TYPES = ["trigger_turn", "generate_image", "run_analysis", "run_tool"] as const satisfies readonly AutomationActionType[];
/** @public twin: SPEND_ARM_TYPES */
export type SpendArmType = (typeof SPEND_ARM_TYPES)[number];

/** S4 — the CONFIRM-FIRST flag, carried by the four SUGGESTIBLE arms and by nothing else (the shape IS the
 *  vocabulary: `SuggestibleArmType` below is derived from which arms carry it, so the two can never drift).
 *  `true` ⇒ at fire time the arm STASHES a pending suggestion instead of acting, and a HOST confirm executes
 *  the stored arm (interaction-direction-spec §3-S4).
 *
 *  WHY IT LIVES ON THE ARM AND NOT ON THE RULE: the stored record's executable half is ONE arm
 *  (`resolvedArm`), so the arm is the unit whose posture this describes; and `automation_rules` carries no
 *  `confirm_first` column — RULED F1 puts the pending ask in RAM, and adding a rule COLUMN for the authoring
 *  half would be a schema change this row does not own. A preset's own `confirmFirst` substitutes onto its
 *  arms at mint. `.default(false)` keeps every stored rule byte-identical in behavior. */
const confirmFirstSchema = z.boolean().default(false);

export const automationActionSchema = z.discriminatedUnion("type", [
  // 1.1 set a chat/global variable (free — no model call).
  z.object({
    type: z.literal("set_variable"),
    scope: z.enum(AUTOMATION_VARIABLE_SCOPES),
    key: z.string().min(1).max(VAR_KEY_MAX),
    op: z.enum(["set", "inc", "dec", "delete"]),
    value: z.string().max(AUTOMATION_VARIABLE_VALUE_MAX).optional(),
  }),
  // 1.2 run a macro template over the draft (the D50 PromptTransform seam).
  // `.min(1)` like the `run_analysis.brief` / `run_tool.name` arms: an arm with NO BODY is not a
  // configuration, it is an unfinished one, and this arm's blank was DESTRUCTIVE rather than inert — a blank
  // template rendered to "" and REPLACED the user's draft with nothing (#1368). The runtime half of that is
  // fixed at the seam (an empty render is a skip, not a rewrite); this half stops the rule being authorable.
  z.object({
    type: z.literal("transform_draft"),
    target: z.enum(PROMPT_TRANSFORM_POINTS),
    template: z.string().min(1).max(TRANSFORM_TEMPLATE_MAX),
  }),
  // 1.3 upsert a world-info entry into a book attached to the rule's chat.
  z.object({
    type: z.literal("insert_world_info_entry"),
    bookId: typeIdSchema(ID_PREFIX.worldBook),
    entryKey: z.string().max(WI_ENTRY_KEY_MAX),
    keys: z.array(z.string()).max(WI_KEYS_MAX),
    contentTemplate: z.string().max(WI_CONTENT_MAX),
    position: z.enum(ENTRY_POSITIONS).default("before"),
    confirmFirst: confirmFirstSchema,
  }),
  // 1.4 surface transient quick-reply chips. The template is rendered at FIRE time in the rule author's env
  // (`arm-executors.ts` renderArmTemplate), never at click time; the rendered text then reaches the clicking
  // member's own surface, where `mode` decides whether the click SENDS it as their turn or seeds their
  // composer draft. `mode` defaults to `send`, which is the arm's built semantic (a chip has always fired as
  // the clicking member's message) — an author who wants the member to own and edit the text says so.
  z.object({
    type: z.literal("surface_quick_reply"),
    choices: z
      .array(
        // Both `.min(1)` (#1368): a blank label reaches the member's chat surface as an INVISIBLE button,
        // and a blank `sendTemplate` sends/seeds nothing when they click it.
        z.object({
          label: z.string().min(1).max(QUICK_REPLY_LABEL_MAX),
          sendTemplate: z.string().min(1).max(QUICK_REPLY_SEND_MAX),
          mode: z.enum(QUICK_REPLY_MODES).default("send"),
        }),
      )
      .min(QUICK_REPLY_MIN_CHOICES)
      .max(QUICK_REPLY_MAX_CHOICES),
  }),
  // 1.5 post an inbox notification (host-authored capped string — an argued exception).
  z.object({
    type: z.literal("post_notification"),
    recipient: z.enum(NOTIFICATION_RECIPIENTS),
    // `.min(1)` (#1368) — a blank message is delivered as an empty toast / an empty inbox row.
    messageTemplate: z.string().min(1).max(NOTIFICATION_MESSAGE_MAX),
  }),
  // 1.6 trigger an autonomous chat turn (SPEND-classed).
  z.object({
    type: z.literal("trigger_turn"),
    speakerCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
    guidedTemplate: z.string().max(GUIDED_TEMPLATE_MAX).optional(),
    confirmFirst: confirmFirstSchema,
  }),
  // 1.7 generate an image (SPEND-classed). Args home in @orb/contracts/imagery (`no-inline-union-redecl`).
  generateImageActionArgsSchema.extend({ type: z.literal("generate_image"), confirmFirst: confirmFirstSchema }),
  // 1.8 auto-background (BG-F — ST `/autobg`): an LLM QUIET-pick over the author's owned background library,
  // writing the CHAT background (host-scoped; scope-safe precisely because BG-C's composition rule makes a
  // chat background INERT for every viewer outside a true-solo room). `instruction` optionally biases the
  // pick (macro-rendered). No arg selects a background directly — the pick is the model's, over real names.
  z.object({
    type: z.literal("set_chat_background"),
    instruction: z.string().max(AUTOBG_INSTRUCTION_MAX).optional(),
    confirmFirst: confirmFirstSchema,
  }),
  // 1.8b run_analysis (S5, SPEND-classed) — the QUIET schema-constrained analysis pass, the honest carrier of
  // the purged crew director's think-first loop. A fire runs ONE structured model call over {the read window,
  // the rule's stored state, the host's steer} and routes each OUTPUT CLASS through the domain's closed union
  // (setState · steer · upsertLoreEntry · suggest · setVariable — `domain/automation/contract/analysis.ts`).
  //
  // `routes` IS the consent-and-capability surface, and ABSENCE is the off switch: a route the author did not
  // spell is not merely skipped — it is REMOVED from the model's enforced response schema (the xgrammar lever),
  // so the pass cannot even emit that output class. The `vars` route is the needle's publication gate
  // (RULED 2026-08-24, OFF by default): no default, no preset in C1 authors it — a host opts a room in by
  // spelling it, and the ONLY value that can cross into member-visible chat vars is the clamped NUMERIC score
  // ({@link ANALYSIS_SCORE_MAX}); arcs/twists/guidance NEVER cross (F6's wall, held by disjoint payload fields).
  //
  // NOT suggestible (no `confirmFirst`): consent is PER-ROUTE (`apply: "confirm"`), because one pass can mix
  // postures — a direct steer beside a confirm-first lore write. `brief`/`steer` are HOST-authored and render
  // as templates like every arm field; the model's OUTPUTS are machine-authored DATA and never render (laws 6/7).
  z.object({
    type: z.literal("run_analysis"),
    /** The analysis TASK the pass runs (preset-authored, host-editable) — what to watch, what to maintain. */
    brief: z.string().min(1).max(ANALYSIS_BRIEF_MAX),
    /** The host's standing direction ("slow burn", "keep it cozy") — rides every pass. Absent ⇒ no steer. */
    steer: z.string().max(ANALYSIS_STEER_MAX).optional(),
    routes: z.object({
      /** The guidance slot: ONE narrator-facing instruction, stored verbatim, delivered by the S2 teaching
       *  contribution. RULED F7: the pacing preset applies it DIRECT. */
      steer: z.object({ apply: z.enum(ANALYSIS_APPLY_MODES).default("direct") }).optional(),
      /** Durable lore distillation into an attached book (the C2 route; settled-span windowed, watermarked,
       *  `neutralizeMacros`-belted). Defaults CONFIRM — a durable canon write earns a card. */
      lore: z.object({ apply: z.enum(ANALYSIS_APPLY_MODES).default("confirm"), bookId: typeIdSchema(ID_PREFIX.worldBook) }).optional(),
      /** Model-suggested guided-turn asks as S4 cards. Confirm-class BY NATURE (a suggestion IS an ask), so
       *  it carries no apply knob — an empty object is the enable switch. */
      suggest: z.object({}).optional(),
      /** C3's PROSE AUDIT: the pass reads the newest reply and offers a conservative rewrite on a card that
       *  PINS the audited variant + a hash of its bytes. Confirm-class BY NATURE — a rewrite of settled canon
       *  is never a direct write, so like `suggest` it carries no apply knob and an empty object is the enable
       *  switch. The pinning is what makes the confirm safe across time: a swipe or an edit between the ask and
       *  the yes REFUSES typed, touching nothing (§3-S4's stale-accept guard). */
      rewrite: z.object({}).optional(),
      /** The needle's score publication (host-OPT-IN — see the header). `key` is the ONE chat var the clamped
       *  score lands in; fixed at authoring, never model-chosen. Direct BY NATURE (a cadence meter). */
      vars: z.object({ key: z.string().min(1).max(VAR_KEY_MAX) }).optional(),
    }),
  }),
  // 1.9 run a registered TOOL by name (SPEND-classed — a tool may call a model, fetch, or generate an image).
  //
  // D146 (a): THIS IS THE CLOSED/OPEN BOUNDARY. The arm is first-party and `tsc`-forced; `name` is the
  // open-world string a CONTRIBUTOR registered. Everything that dispatches on the arm vocabulary stays
  // exhaustive, and everything that varies per contributor lives in one string field.
  //
  // `name` carries NO charset check here on purpose (see {@link TOOL_NAME_MAX}) — the registry is the
  // authority and `createRule` resolves the name against it, so an unknown, malformed or NOT-YOURS name is a
  // typed refusal at MINT rather than a stored rule that can only ever fail. `argsTemplate` is macro-rendered
  // at FIRE time in the rule author's env (every arm's template discipline) and must render to a JSON object;
  // the tool's own schema parses it, so a bad shape is the tool's errors-as-data answer, never a crash.
  //
  // NOT SUGGESTIBLE (no `confirmFirst`), decided with reasons rather than by omission: the four suggestible
  // arms all describe a concrete, human-weighable act ("Take a turn", "Save a lore entry for X", "Illustrate
  // the scene", "Change the room's background"). A confirm card for this arm could name the TOOL and nothing
  // about what it will do — the effect lives in third-party code behind a name — so the ask would be a
  // click-through, not consent (the same law that keeps `set_variable` out: a delta a host cannot weigh).
  // Consent has also already happened twice by the time this arm can exist: the owner GRANTED `tools.register`
  // at install, and the rule's author is both the chat host and the tool's own installer (the mint gate below
  // admits nothing else).
  z.object({
    type: z.literal("run_tool"),
    name: z.string().min(1).max(TOOL_NAME_MAX),
    /** The macro-rendered JSON argument document. Defaults to the empty object — a zero-arg tool. */
    argsTemplate: z.string().max(TOOL_ARGS_TEMPLATE_MAX).default("{}"),
    /** Optionally capture the tool's result STRING into a variable, so a later arm / a later rule's predicate
     *  can read it. Absent ⇒ nothing is captured. NEVER prose: a tool result is DATA back to the arm, and no
     *  message-write op exists on this surface (the class-1 wall). The captured value is TRUNCATED to
     *  {@link AUTOMATION_VARIABLE_VALUE_MAX} by the executor — see that constant for why the bound matters
     *  more here than on an authored template. */
    resultVar: z.string().min(1).max(VAR_KEY_MAX).optional(),
    /** Which variable plane `resultVar` writes — the SAME vocabulary `set_variable.scope` uses (one axis, one
     *  spelling). `chat` (the default) writes the room's runtime fold; `global` writes the AUTHOR's own plane. */
    resultScope: z.enum(AUTOMATION_VARIABLE_SCOPES).default("chat"),
  }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

/** The AUTHORING shape of an arm — the schema's INPUT, where every defaulted field (`mode`, `position`,
 *  `confirmFirst`, the imagery args) is optional. `AutomationAction` is the STORED/DISPATCHED shape, where
 *  the same fields are present because the parse filled them.
 *
 *  WHY BOTH EXIST, and which surfaces take which: anything that AUTHORS arms (a preset builder, a
 *  `createRule` caller, a test fixture) hands over what a human wrote and the verb NORMALIZES it —
 *  `validateRuleInput` parses, and `createRule` persists the PARSED result, never its own params. Typing
 *  those surfaces as the output type instead is what makes every added default a repo-wide churn wave: it
 *  demands `confirmFirst: false` on literals whose author never heard of confirm-first. (Measured, not
 *  argued: `mode`'s own default shipped with a red on `contract/presets.ts`'s chip builder for exactly this
 *  reason, and adding `confirmFirst` reproduced it 33× before the split.) Everything DOWNSTREAM of the
 *  parse — the dispatcher, the arm executors, the stored row — keeps the output type, so a defaulted field
 *  is never `undefined` where it is read. */
export type AutomationActionInput = z.input<typeof automationActionSchema>;

/** S4 — the SUGGESTIBLE arms, DERIVED from the shape (which arms carry `confirmFirst`) rather than listed:
 *  the tuple-and-union pair cannot drift because there is no second list. The domain holds the exhaustive
 *  `Record<SuggestibleArmType, summary>` the spec names as the enforcer — an arm that GAINS the field
 *  without a summary line fails `tsc` there.
 *
 *  Consent, not cost: this is "which arms may be held for a host's yes", a DIFFERENT axis from
 *  {@link SPEND_ARM_TYPES} ("which arms cost the author money"). They overlap on `trigger_turn` /
 *  `generate_image` and diverge on `set_chat_background` (suggestible, not spend) — never collapse them. */
export type SuggestibleArmType = Extract<AutomationAction, { readonly confirmFirst: boolean }>["type"];
/** One suggestible arm, narrowed — the shape the pending store holds as its executable half. */
export type SuggestibleAction = Extract<AutomationAction, { readonly confirmFirst: boolean }>;

/** Whether an authored arm asked to be CONFIRMED rather than run. The runtime half of the type above (the
 *  field is unspellable on the other four arms, so the `in` test IS the narrowing). */
export function isConfirmFirstArm(action: AutomationAction): action is SuggestibleAction {
  return "confirmFirst" in action && action.confirmFirst;
}

/** The stored ordered action list (1..8 arms) — the `automation_rules.actions` json column. */
export const automationActionsSchema = z.array(automationActionSchema).min(AUTOMATION_ACTION_ARMS_MIN).max(AUTOMATION_ACTION_ARMS_MAX);

// ── TriggerFact + the CEL activation ────────────────────────────────────────────────────────────
/** The per-event fact CEL binds as `event` AND the fact a plugin `events.on` handler receives across the
 *  QuickJS realm boundary. Fields are POPULATED PER TRIGGER TYPE; unpopulated
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
const triggerFactPayloadSchema = z.object({
  // @orb-waive no-raw-id(chatId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
  chatId: z.string().nullable(),
  // messageCommitted / messageEdited / variantSelected / messageHidden
  message: z
    .object({
      id: z.string(),
      role: z.enum(MESSAGE_ROLES),
      // @orb-waive no-raw-id(authorUserId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
      authorUserId: z.string().nullable(),
      // @orb-waive no-raw-id(characterId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
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
      // The provider REGISTRY id the turn ran on (inference program §5.3b — was the retired `source` word).
      provider: z.string(),
      model: z.string(),
      // @orb-waive no-raw-id(speakerCharacterId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
      speakerCharacterId: z.string().nullable(),
      abortReason: z.string().optional(), // turnAborted only
      automationDepth: z.number(), // 0 = human-initiated (the cascade guard reads this)
    })
    .optional(),
  // worldInfoActivated
  worldInfo: z.object({ entryIds: z.array(z.string()).readonly() }).optional(),
  /** reactionsChanged (B6/MR0). NESTED because it carries four fields (the `message`/`turn` reason).
   *
   *  `added` is the DIRECTION — a removal fires the same trigger as an addition, and a rule that means
   *  "somebody laughed at this" must be able to say `event.reaction.added`, or every un-react re-fires it.
   *  `emoji` crosses as the raw token (never an enum): the vocabulary is open by design (the custom `:name:`
   *  arm), so pinning it to today's tuple here would make the guest-marshalling contract lie the day it
   *  widens. Ids cross UNBRANDED like every other id on this shape. The REACTOR is deliberately absent: a
   *  seat id is roster data a predicate has no way to resolve, and the useful facts are what and where. */
  reaction: z
    .object({
      // @orb-waive no-raw-id(messageId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
      messageId: z.string(),
      // @orb-waive no-raw-id(variantId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
      variantId: z.string(),
      emoji: z.string(),
      added: z.boolean(),
    })
    .optional(),
  // personaSwitched (the CHAT-bus member — a seat changed face mid-room). Distinct from the domain-bus
  // `personaId` below, which reports that a persona's own CONTENT was edited; two events, two shapes.
  persona: z.object({ from: z.string().nullable(), to: z.string().nullable() }).optional(),
  // domain-bus members
  /** character.updated. NESTED because it carries TWO fields, which is the same reason `message`/`turn`/
   *  `worldInfo` nest and `assetId` does not.
   *
   *  `contentChanged` is the source event's own discriminator (`@orb/contracts/events`'s
   *  `CharacterUpdatedEvent`) and the resolver used to DROP it, which made the domain-bus character trigger
   *  fire identically on a real card edit and on a star/archive toggle. A rule that reacts to library
   *  content — the living-library preset is the catalogue's own case — then degenerated into an edit-burst
   *  chore, firing on flags nobody thinks of as an edit. Carrying it is what lets a predicate say
   *  `event.character.contentChanged` and mean it. The field is REQUIRED inside the object (the source
   *  event always carries it), so a predicate needs only the `has(event.character)` guard law 1 already
   *  demands. */
  character: z.object({ id: z.string(), contentChanged: z.boolean() }).optional(),
  // @orb-waive no-raw-id(assetId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
  assetId: z.string().optional(), // asset.created
  // @orb-waive no-raw-id(personaId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
  personaId: z.string().optional(), // persona.updated (S7) — the persona whose CONTENT changed
  // @orb-waive no-raw-id(worldBookId): guest-marshalled predicate data crosses the sandbox as an unbranded structured-clone string. Ends if the membrane validates canonical brands before cloning.
  worldBookId: z.string().optional(), // world-info.updated (S7) — the OWNING book of the changed row
});
export const triggerFactSchema = z.discriminatedUnion("bus", [
  triggerFactPayloadSchema.extend({ bus: z.literal("chat"), type: z.enum(CHAT_TRIGGER_TYPES) }),
  triggerFactPayloadSchema.extend({ bus: z.literal("domain"), type: z.enum(DOMAIN_TRIGGER_TYPES) }),
]);
export type TriggerFact = z.infer<typeof triggerFactSchema>;

/** The CEL activation for a rule predicate (and for `{{expr::…}}`). All values are JSON-safe
 *  scalars/lists/maps; no functions beyond CEL's builtins; no handles. */
export interface AutomationCelEnv {
  /** The resolved TriggerFact — predicate-only; absent under `{{expr::…}}` (no event there). */
  readonly event?: TriggerFact;
  /** The chat's CURRENT runtime variables — the materialized delta-fold cache. Read-only to the PREDICATE/CEL
   *  side, but the dispatch's `set_variable` arm WRITES THROUGH onto this shared map after a chat-scope mutation
   *  (arms mutate the shared env, order IS semantics): the env is built + cached once per chat
   *  per batch, so a DB-only write would be invisible to later arms + later same-chat rules in the batch. */
  readonly vars: Record<string, string>;
  /** ChoiceBlock config-plane picks, MERGED view (picks ∪ preset defaults). */
  readonly choice: Record<string, string>;
  /** The RULE AUTHOR's per-user global variables — never the triggering member's namespace. */
  readonly global: Record<string, string>;
  /** Narrow chat projections. Deliberately tiny; a predicate needing more is a Tier-2 job. */
  readonly chat: { readonly id: string; readonly messageCount: number };
  /** The injected clock, sampled ONCE per dispatch batch (determinism + no intra-batch skew). */
  readonly now: { readonly epochMs: number; readonly hour: number; readonly dayOfWeek: number };
}

// ── S4: the suggest/confirm vocabulary ────────────────────────────────────────────────────────────
// The #14 three-posture law over rules AND plugins: standing authority ⇒ act; no standing authority ⇒ ASK
// the host. A PLUGIN joins the same law and the same inbox — a plugin whose installer is not host of the
// invocation chat raises an ask instead of taking a flat refusal (`domain/plugin`; the act vocabulary is
// `@orb/contracts/plugin`'s `PluginSuggestedAct`). One store, one card surface, one host answer: a second
// proposal system would mean a second TTL, a second sweep and two places to look.
//
// TWO classes, and the difference is what the pending record can hold (interaction-direction-spec §3-S4):
//   • `confirm`    — a confirm-first ARM stashed its resolved self at fire time (after predicate + env), so
//                    the confirm executes THAT arm, in the author's frame, exactly as it would have run.
//   • `invitation` — a `budget_refused` fires BEFORE the predicate and before any env exists
//                    (`engine/dispatch.ts` runGates), so NO arm can have rendered: the ask carries the RULE
//                    REFERENCE only and its confirm is a FRESH host run (`runRuleNow`). No stored payload,
//                    therefore no TOCTOU by construction.

export const AUTOMATION_SUGGESTION_KINDS = ["confirm", "invitation"] as const;
export type AutomationSuggestionKind = (typeof AUTOMATION_SUGGESTION_KINDS)[number];

/** The rendered ask's cap. A card is one line of host-facing prose, not a preview pane. */
export const AUTOMATION_SUGGESTION_SUMMARY_MAX = 200;

/** What ONE dispatch of a rule DID, as a VERB RESULT reports it (`runRuleNow`, `confirmSuggestion`): a fire
 *  terminal, or one of the two NON-FIRE terminals below.
 *
 *  Neither `suggested` nor `paused` is a member of {@link AUTOMATION_FIRE_OUTCOMES}, and the distinction is the
 *  fire log's honesty (§3-S4 + §6 R5): NO row is written for either, because neither is a fire. Adding a
 *  terminal to the outcome TUPLE is a CHECK edit on a generated baseline and is recorded-unbuilt as R5, so this
 *  union is the house home for "a terminal a verb must be able to report and the log must not claim". It exists
 *  so a verb can ANSWER "what happened?" without either lying (`fired`) or going silent.
 *
 *  • `suggested` — the arms raised a pending ask instead of acting. The CONFIRMED execution writes `fired`,
 *    stamped with the confirmer.
 *  • `paused` — D146 clause (d), THE CLAUSE WITH NO FIRST-PARTY ANALOGUE. A rule naming a CONTRIBUTOR's tool
 *    (`run_tool`) whose contributor is not currently available to the rule's author does not act, and does not
 *    ERROR. It must not error: an `arm_error` increments `consecutive_errors` and a rule auto-disables at 20
 *    (`domain/automation/engine/dispatch.ts`), so treating a disabled plugin as a fault would silently eat
 *    every rule naming its tools, and re-enabling the plugin would not bring them back. `paused` is
 *    self-healing by construction — it changes NO stored state, so the very next event after the plugin comes
 *    back dispatches normally. A first-party contributor cannot vanish; a plugin does so by ordinary user
 *    action, which is why this terminal exists at all. */
export type AutomationRunOutcome = AutomationFireOutcome | "suggested" | "paused";

// ── the cascade origin + the automation bus ─────────────────────────────────────────────────────────
/** Turn-path/write origin stamped by an automation-initiated effect: the rule + its cascade depth.
 *  NEVER a bus-event field (the D19/D50 allowlist forbids attribution on the public bus). */
export interface AutomationOrigin {
  readonly ruleId: AutomationRuleId;
  readonly automationDepth: number;
}

/** Who SURFACED a member-visible bus emission — a rule (the automation lane) OR a plugin (the membrane's
 *  `chat.quick_reply` capability rides the SAME per-chat bus). A discriminated union, NOT a
 *  synthetic rule id: a plugin-surfaced reply has no rule, so the source carries the ACTUAL origin id. Both
 *  emitters + every consumer discriminate on `kind`. */
export type AutomationEmitSource = { kind: "rule"; ruleId: AutomationRuleId } | { kind: "plugin"; pluginId: PluginId };

/** The automation's OWN per-chat SSE feedback bus (its own bus, NOT the frozen chat bus; the
 *  purged rpg/agents designs set this precedent). `quickReplySurfaced` is the one MEMBER-visible event (rendered display strings, not
 *  ids — the chips are transient, there is no row to re-read); everything else is host-only + id-only. The
 *  chips can be surfaced by a rule OR a plugin, so `quickReplySurfaced` carries the `AutomationEmitSource`
 *  union (the rest are rule-lifecycle events — rule-only by construction).
 *
 *  `suggestionRaised` (S4) is HOST-ONLY like the rest, and needed NO transport edit to be so: the room
 *  source's member filter is DEFAULT-DENY — it forwards exactly `quickReplySurfaced` to a member-tier
 *  subscriber and drops everything else (`transport/trpc/stream/sources/automation.ts`). It carries display
 *  strings for the same reason the chips do: the pending record is in RAM (RULED F1), so there is nothing to
 *  re-read. */
/** The optional STRUCTURED half of a raised ask — what a card needs to show that one line of summary prose
 *  cannot. It exists for exactly one reason and gains members the same way: a REWRITE card must show the host
 *  WHAT WOULD CHANGE before they say yes, and a "Fix the prose?" summary is not that. Both strings are capped
 *  at {@link ANALYSIS_REWRITE_MAX} at the producer.
 *
 *  IT RIDES THE EVENT rather than a query for the same reason `summary` does: the pending record is in RAM
 *  (RULED F1), so there is no row to re-read. And it is safe to ride a host-only event: `suggestionRaised` is
 *  never forwarded to a member subscriber (the room source's member filter is default-deny), so the audited
 *  text crosses to exactly the host who could already read it in the transcript.
 *
 *  DISCRIMINATED FROM ONE MEMBER: `kind` is spelled today so the second detail is a union arm rather than a
 *  re-type of every consumer (the single-arm-union seam shape). */
export interface RewriteCardDetail {
  readonly kind: "rewrite";
  /** The audited variant's bytes AS THEY WERE at the ask — the diff's left side and the host's "before". */
  readonly before: string;
  readonly after: string;
}
export type SuggestionCardDetail = RewriteCardDetail;

export type AutomationBusEvent =
  | { type: "quickReplySurfaced"; chatId: ChatId; source: AutomationEmitSource; choices: readonly { label: string; sendText: string; mode: QuickReplyMode }[] }
  | {
      type: "suggestionRaised";
      chatId: ChatId;
      /** WHO is asking — the SAME `AutomationEmitSource` union `quickReplySurfaced` already carries, and for
       *  the same reason: a plugin ask has no rule, so the source names the ACTUAL origin id rather than a
       *  synthetic rule. It is also the replace-per-kind key on both sides (server store + client fold), so a
       *  cadence rule and a chatty plugin each keep exactly ONE live card. */
      source: AutomationEmitSource;
      suggestionId: AutomationSuggestionId;
      kind: AutomationSuggestionKind;
      /** The rendered ASK the host reads on the card — display text, not an id to re-read (there is no row;
       *  the pending record is in RAM). Capped at {@link AUTOMATION_SUGGESTION_SUMMARY_MAX}. */
      summary: string;
      /** The injected-clock deadline the pending record dies at — the client drops its card on the same
       *  edge the server sweeps, so a stale card never sits offering an ask that would refuse. */
      expiresAt: number;
      /** OPTIONAL structured body ({@link SuggestionCardDetail}) — present only for the ask classes whose card
       *  shows more than a question (today: C3's rewrite diff). Absent ⇒ the card is title + actions, exactly
       *  as every A4 card renders today, so this field changes no existing event's bytes. */
      detail?: SuggestionCardDetail;
    }
  /** S4 RETIREMENT (host-only, id-only) — the twin of `suggestionRaised`: a pending ask was ANSWERED
   *  (confirmed or dismissed) and deleted from the in-RAM store, so every attached HOST tab drops its card.
   *  Emitted the moment the ask leaves the store — at the take-once CLAIM (confirm, before any re-check, so a
   *  refused confirm retires the card too) and the DROP (dismiss). Id-only: there is no row to re-read
   *  (RULED F1); the client fold filters the matching `asks` entry out. The acting tab also retires
   *  optimistically (the mount's per-call `onSuccess`), but the host's OTHER tabs/devices have no query and no
   *  replay behind this live-only room, so without this member their card sat dead until TTL (30 min). §3-S4
   *  originally ruled ONE new host-only member (`suggestionRaised`); this retirement twin is the one-line spec
   *  delta recorded in interaction-direction-spec §3-S4. */
  | { type: "suggestionResolved"; chatId: ChatId; suggestionId: AutomationSuggestionId }
  | { type: "ruleFired"; chatId: ChatId; ruleId: AutomationRuleId }
  | { type: "ruleErrored"; chatId: ChatId; ruleId: AutomationRuleId }
  | { type: "ruleAutoDisabled"; chatId: ChatId; ruleId: AutomationRuleId }
  | { type: "rulesChanged"; chatId: ChatId };
/** @public twin: AutomationBusEvent — discriminant twin of the live union (cross-package PUBLIC). */
export type AutomationBusEventType = AutomationBusEvent["type"];

/** The automation bus's PRODUCER-coverage belt. The `satisfies Record<AutomationBusEvent["type"], true>`
 *  makes `tsc` error the moment a member is added without an entry, and its existence is what puts the bus
 *  inside the coverage ratchets' quantifier — `bus-definition-belts` and the `bus-producer-coverage` spec
 *  both find the bus THROUGH this const. Minted 2026-08-14 with the G-B belt-existence arm: until then
 *  `AutomationBusEvent` had no belt at all, so no gate could see the bus, and `rulesChanged` sat declared
 *  and un-emitted for the life of the domain (event-bus coverage survey §2.3 — the newest bus already had
 *  dead wire, invisibly). The const is NOT inert data: minting it alone fires both arms of
 *  `bus-definition-belts`, which is why it lands WITH the gate work and not ahead of it.
 *  THE REACH-LANE ROW IS GONE (2026-08-24, A4): the client consumer landed. `AutomationBusEvent` now has a
 *  real client total map — the S4 card source's `Record<AutomationBusEvent["type"], …>` reducer in
 *  `packages/client/src/features/automation/` — so the `SERVER_INTERNAL_REACH.AutomationBusEvent` exemption
 *  in `bus-definition-belts` went two-sided RED on its own stated end condition and was deleted with it.
 *  @public future: the automation client INVALIDATION map. The card source's reducer is the consumer-
 *  exhaustiveness belt, not an invalidation seam — the automation room is live-only with no durable half
 *  (no cursor, no replay), so there is no gap-heal set for this const to derive the way
 *  `invalidation.ts::allUserRootFilters` derives one from USER_BUS_EVENT_TYPES. It gains that consumer the
 *  day a bus member invalidates a query (B2's fire log off `ruleFired` is the named candidate). */
export const AUTOMATION_BUS_EVENT_TYPES = {
  quickReplySurfaced: true,
  suggestionRaised: true,
  suggestionResolved: true,
  ruleFired: true,
  ruleErrored: true,
  ruleAutoDisabled: true,
  rulesChanged: true,
} satisfies Record<AutomationBusEvent["type"], true>;

// S3 — the rule-PRESET wire slice: the committed id tuple + the picker's read model (knob descriptors).
// A preset is data OVER this action vocabulary — it mints ordinary rules, it adds no arm. The CEL sources
// and the mint handlers stay domain-side (`domain/automation/contract/presets.ts`).
export type {
  RulePresetChoiceKnobDescriptor,
  RulePresetEntityKind,
  RulePresetEntityRefKnobDescriptor,
  RulePresetEntityRefValueOf,
  RulePresetId,
  RulePresetKnobDescriptor,
  RulePresetKnobKind,
  RulePresetKnobValue,
  RulePresetKnobValueInput,
  RulePresetKnobValueInputs,
  RulePresetKnobValueOf,
  RulePresetKnobValues,
  RulePresetKnobView,
  RulePresetNumberKnobDescriptor,
  RulePresetScope,
  RulePresetTextKnobDescriptor,
  RulePresetTextListKnobDescriptor,
  RulePresetView,
} from "./presets.ts";
export {
  RULE_PRESET_ENTITY_KINDS,
  RULE_PRESET_ENTITY_NOUNS,
  RULE_PRESET_ENTITY_REF_SCHEMAS,
  RULE_PRESET_IDS,
  RULE_PRESET_KNOB_KINDS,
  RULE_PRESET_SCOPES,
  rulePresetIdSchema,
  rulePresetKnobBagsEqual,
  rulePresetKnobBagToInputs,
  rulePresetKnobValuesSchema,
  rulePresetScopeSchema,
} from "./presets.ts";

// The PROSE-1 slot table (census row 91) — the `set_chat_background` quiet pick's two authored clauses.
// `#prose` imports this to compose `PROSE_SLOTS`; it lives beside the action vocabulary it teaches.
export { AUTOMATION_PROSE_SLOTS } from "./prose.ts";
