// domain/automation/contract/params — the *Params for the automation verbs. Each wraps the acting
// `principal`; the global-variable verbs (A3) scope by `principal.userId` (single-owned plane, 02 §4 / D18);
// the rule-lifecycle verbs (A4) gate `can(principal, "host", …)` over the chat's membership. The wire
// vocabulary (trigger/action shapes) lives in `@orb/contracts/automation`; these are server-internal call
// shapes.

import type { AutomationAction, AutomationTrigger, TriggerFact } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";

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

// ── rule-lifecycle verb params (A4) ─────────────────────────────────────────────────────────────
// Every rule verb gates `can(principal, "host", {kind:"chat", roster})` over the chat's membership (04 §2 —
// rule authoring IS room authority in v1). The editable field set is shared by create + update (a PUT-style
// replace; `updateRule` re-runs the same validation and resets `consecutive_errors`).

/** The editable rule fields shared by `createRule` + `updateRule`. Defaults (born disabled, position, the
 *  DB budget defaults) are the verb's / schema's concern — not the caller's. */
interface RuleEditableParams {
  readonly name: string;
  readonly description?: string;
  readonly trigger: AutomationTrigger;
  readonly predicateCel?: string | null;
  readonly actions: readonly AutomationAction[];
  readonly matchAutomationEvents?: boolean;
  readonly cooldownSeconds?: number;
  readonly maxFiresPerHour?: number;
}

export interface CreateRuleParams extends AutomationActorParams, RuleEditableParams {
  /** v1 rules are chat-scoped (the nullable owner-global column is born-not-wired — 04 §1). */
  readonly chatId: ChatId;
}

export interface UpdateRuleParams extends AutomationActorParams, RuleEditableParams {
  readonly ruleId: AutomationRuleId;
}

export interface SetRuleEnabledParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly enabled: boolean;
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

export interface GetBudgetsParams extends AutomationActorParams {
  readonly chatId: ChatId;
}

export interface ListFiresParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly limit?: number;
}

/** Upsert the per-chat budget row (host-editable — 03 §3). Absent fields keep the DB default / current
 *  value; `maxUsdPerDay: null` clears the dollar ceiling (local-only setups). */
export interface SetBudgetsParams extends AutomationActorParams {
  readonly chatId: ChatId;
  readonly maxFiresPerHour?: number;
  readonly maxSpendActionsPerDay?: number;
  readonly maxUsdPerDay?: number | null;
}

/** The dry-run: a host-supplied `sampleEvent` (or a synthesized minimal fact from the rule's trigger) is
 *  evaluated + every arm rendered, executing nothing (04 §2). */
export interface TestRuleParams extends AutomationActorParams {
  readonly ruleId: AutomationRuleId;
  readonly sampleEvent?: TriggerFact;
}

/** The `automation.stream` subscribe-time authority resolve (04 §5): the caller's tier over the chat, or a
 *  leak-free NOT_FOUND for a non-present member. Member-level (NOT host-gated) — the room-visible
 *  `quickReplySurfaced` chips reach every participant; the tier only decides whether the host-only events
 *  (fire/error/disable) also flow. */
export interface ResolveStreamAuthorityParams extends AutomationActorParams {
  readonly chatId: ChatId;
}
