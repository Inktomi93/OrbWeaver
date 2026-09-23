// domain/automation/contract/params — the *Params for the automation verbs. Each wraps the acting
// `principal`; the global-variable verbs scope by `principal.userId` (single-owned plane, D18);
// the rule-lifecycle verbs gate `can(principal, "host", …)` over the chat's membership. The wire
// vocabulary (trigger/action shapes) lives in `@orb/contracts/automation`; these are server-internal call
// shapes.

import type { AutomationActionInput, AutomationTrigger, RulePresetId, RulePresetKnobValues, TriggerFact } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { AutomationRuleId, AutomationSuggestionId, ChatId } from "@orb/kit/ids";
import type { RulePresetKnobOverrides } from "./presets.ts";

/** Common to every global-variable verb: the acting principal whose `userId` scopes the plane. */
interface AutomationActorParams {
  readonly principal: Principal;
}

export interface GetGlobalVariableParams extends AutomationActorParams {
  readonly key: string;
}

export interface SetGlobalVariableParams extends AutomationActorParams {
  readonly key: string;
  readonly value: string;
}

export interface DeleteGlobalVariableParams extends AutomationActorParams {
  readonly key: string;
}

/** List the caller's globals; `prefix` narrows by key prefix (the settings-page filter). Absent = all. */
export interface ListGlobalVariablesParams extends AutomationActorParams {
  readonly prefix?: string;
}

// ── rule-lifecycle verb params ──────────────────────────────────────────────────────────────────
// Every rule verb gates `can(principal, "host", {kind:"chat", membership})` over the chat's membership
// (rule authoring IS room authority in v1). The editable field set is shared by create + update (a PUT-style
// replace; `updateRule` re-runs the same validation and resets `consecutive_errors`).

/** The editable rule fields shared by `createRule` + `updateRule`. Defaults (born disabled, position, the
 *  DB budget defaults) are the verb's / schema's concern — not the caller's. */
interface RuleEditableParams {
  readonly name: string;
  readonly description?: string;
  readonly trigger: AutomationTrigger;
  readonly predicateCel?: string | null;
  /** AUTHORED arms (the schema's INPUT — defaulted fields optional). The verb PARSES them and persists
   *  the parsed result, so a caller never spells a default it did not choose. */
  readonly actions: readonly AutomationActionInput[];
  readonly matchAutomationEvents?: boolean;
  readonly cooldownSeconds?: number;
  readonly maxFiresPerHour?: number;
}

/** Mint provenance (the §3-S3 flip shape) — WHICH rule preset a mint came from, with the COMPLETE
 *  resolved knob bag. Written to `automation_rules.rule_preset_id`/`rule_preset_knobs`. */
export interface RulePresetProvenance {
  readonly rulePresetId: RulePresetId;
  readonly knobs: RulePresetKnobValues;
}

export interface CreateRuleParams extends AutomationActorParams, RuleEditableParams {
  /** WHERE the rule lives: a chat, or NULL for the owner-GLOBAL lane (C5). The two scopes take two different
   *  authority gates and two different arm sets — `verbs/create-rule.ts` states both. Required-and-nullable
   *  rather than optional, deliberately: a caller must SAY which lane it means, so an omitted field can never
   *  silently mint a global rule. */
  readonly chatId: ChatId | null;
  /** VERB-ONLY (never on the tRPC wire — the router's schema does not spell it, so a hand-authored rule
   *  can never claim a preset's mint): `createRuleFromPreset` stamps this on each rule of its set, which
   *  is what holds the provenance biconditional (present ⟺ the row is exactly that preset's mint —
   *  `updateRule` clears it on any edit). */
  readonly presetProvenance?: RulePresetProvenance;
}

export interface UpdateRuleParams extends AutomationActorParams, RuleEditableParams {
  readonly ruleId: AutomationRuleId;
}

/** S3 — mint a preset's ordered rule SET into a chat (host-only; each rule through `createRule`). `knobs`
 *  is a PARTIAL override bag; an absent key takes its descriptor default, and an unknown key is refused.
 *  v1 has no post-mint knob edit — the edit path is delete + re-mint (interaction-direction-spec §3-S3). */
export interface CreateRuleFromPresetParams extends AutomationActorParams {
  /** The room to mint into, or NULL for the owner-GLOBAL lane. It must AGREE with the named preset's own
   *  declared `scope` and the verb refuses a mismatch typed — a preset's rules are written against a scope
   *  (a global preset's arms may not touch a room), so pairing them wrongly is an authoring error the mint
   *  names rather than a configuration the engine tries to honour. */
  readonly chatId: ChatId | null;
  readonly presetId: RulePresetId;
  readonly knobs?: RulePresetKnobOverrides;
}

export interface SetRuleEnabledParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly enabled: boolean;
}

/** RULED F4's per-rule OPT-OUT (interaction-direction-spec row B4): whether a RATE REFUSAL of this rule
 *  still offers the host the "run it now?" invitation. A targeted one-column flip, shaped on
 *  {@link SetRuleEnabledParams} rather than folded into the create/update field set — `updateRule` is a PUT
 *  that CLEARS the mint provenance, and a preference toggle must not cost a host their saved-cast lineage. */
export interface SetRuleSuggestOnRefusalParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly suggestOnRefusal: boolean;
}

export interface DeleteRuleParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
}

export interface ReorderRulesParams extends AutomationActorParams {
  readonly chatId: ChatId;
  readonly orderedIds: readonly AutomationRuleId[];
}

export interface ListRulesParams extends AutomationActorParams {
  readonly chatId: ChatId;
}

export interface ListFiresParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly limit?: number;
}

/** B11 — the room Activity read: a CHAT's recent fire log across ALL its rules, newest first (host-only).
 *  Chat-scoped like `listRules`, so authority is `requireChatHost(chatId)` — a non-member collapses to a
 *  leak-free NOT_FOUND. Distinct from `listFires` (per-rule): this is the room's out-of-band history in ONE
 *  indexed read (`automation_fires_chat_idx`), so the surface needs no client-side fan-out over the chat's
 *  rules. A deleted rule's fires CASCADE with it (FK `onDelete: cascade`), so the log reflects the chat's
 *  currently-live rules' activity. */
export interface ListChatActivityParams extends AutomationActorParams {
  readonly chatId: ChatId;
  readonly limit?: number;
}

/** C5 — the OWNER-GLOBAL lane's rule list (the Automation settings pane's read). Takes no id at all: the
 *  plane is single-owned, so the caller's own `principal.userId` IS the scope (the `listGlobalVariables`
 *  posture). There is no way to ask for someone else's lane, which is what makes the read leak-free by
 *  construction rather than by a gate. */
export type ListOwnerRulesParams = AutomationActorParams;

/** C5 — read the caller's own owner-global fire-rate cap. Same single-owned posture as above. */
export type GetOwnerBudgetsParams = AutomationActorParams;

/** C5 — upsert the caller's own owner-global fire-rate cap. An absent field keeps the DB default / current
 *  value. */
export interface SetOwnerBudgetsParams extends AutomationActorParams {
  readonly maxFiresPerHour?: number;
}

/** The dry-run: a host-supplied `sampleEvent` (or a synthesized minimal fact from the rule's trigger) is
 *  evaluated + every arm rendered, executing nothing. */
export interface TestRuleParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly sampleEvent?: TriggerFact;
}

/** R7 — the host's "run this rule now" (§6 R7): ONE fresh dispatch of `ruleId` at cascade depth 0. The
 *  `chatId` is NOT taken from the caller — the rule's own chat is authoritative and the guard gates it. */
export interface RunRuleNowParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
}

/** S4 — confirm a pending ask by id (host-only). The id is the CLAIM handle: a second confirm of the same id
 *  finds nothing (take-once) and refuses leak-free. */
export interface ConfirmSuggestionParams extends AutomationActorParams {
  readonly suggestionId: AutomationSuggestionId;
}

/** S4 — dismiss a pending ask by id (host-only). */
export interface DismissSuggestionParams extends AutomationActorParams {
  readonly suggestionId: AutomationSuggestionId;
}

/** The `automation.stream` subscribe-time authority resolve: the caller's tier over the chat, or a
 *  leak-free NOT_FOUND for a non-present member. Member-level (NOT host-gated) — the room-visible
 *  `quickReplySurfaced` chips reach every participant; the tier only decides whether the host-only events
 *  (fire/error/disable) also flow. */
export interface ResolveStreamAuthorityParams extends AutomationActorParams {
  readonly chatId: ChatId;
}
