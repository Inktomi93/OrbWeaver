// domain/automation/contract/errors — the automation slice's typed errors. A cap/shape/validation violation
// is an INVALID operation (`DomainOperationError` → BAD_REQUEST); a missing rule collapses to a leak-free
// not-found (`DomainNotFoundError` → NOT_FOUND). The DB CHECK is the ultimate guard for stored shapes; the
// pre-validation here gives a clean, typed refusal before the write. The rule-lifecycle errors are added below.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { AutomationRuleId, AutomationSuggestionId, ChatId } from "@orb/kit/ids";

/** A global-variable key/value violates its cap (key ≤ 128 chars, value ≤ 64 KiB, key non-empty). */
export class GlobalVariableInvalidError extends DomainOperationError {
  constructor(reason: string) {
    super("global_variable_invalid", reason);
  }
}

/** `createRule`/`updateRule` refused: the trigger is a RESERVED tuple member (typed but not wired v1 —
 *  never wired in v1). A user-visible refusal, never a silent no-op. */
export class AutomationReservedTriggerError extends DomainOperationError {
  constructor(triggerType: string) {
    super("automation_reserved_trigger", `trigger '${triggerType}' is reserved (not wired in v1)`);
    this.name = this.constructor.name;
  }
}

/** `createRule`/`updateRule` refused for a validation reason other than a reserved trigger: a reserved
 *  action arm, an unparseable CEL predicate, an out-of-range arm cap, a cooldown floor violation, an
 *  unattached world-info book, or (`unknown_tool`) a `run_tool` arm naming a tool the rule's AUTHOR cannot
 *  drive — D146-b's per-rule replacement for a first-party seam's boot-fatal assertion. Carries a machine
 *  `code` for the editor's inline surface. */
export class RuleValidationError extends DomainOperationError {
  constructor(code: string, reason: string) {
    super(`automation_rule_${code}`, reason);
    this.name = this.constructor.name;
  }
}

/** `reorderRules` refused: the supplied id list is not a TOTAL, unique order over the chat's current rule
 *  set (#1429). The verb rewrites `position = array index` per id, so anything less than the complete set
 *  leaves the chat with duplicate positions and a non-total order while reporting success — and order IS
 *  semantics here (arms mutate the shared variable env in position order). The three codes name what the
 *  editor got wrong: `duplicate` (an id twice), `foreign` (an id that is not this chat's rule — the batch's
 *  chat predicate already makes it touch no row, so it is a caller BUG, not a leak), `incomplete` (a rule of
 *  this chat is missing from the list). Never a leak: `foreign` names no id, because a caller who guessed a
 *  rule id must not learn from the refusal whether it exists. */
export class RuleReorderError extends DomainOperationError {
  constructor(code: string, reason: string) {
    super(`automation_reorder_${code}`, reason);
    this.name = this.constructor.name;
  }
}

/** `setOwnerBudgets` refused: the fire-rate ceiling is not an integer in
 *  `0..AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR` (#1430). The AUTHORITATIVE bound lives at the verb — the wire
 *  schema mirrors it — because the belt is loop safety and a caller reaching the domain from compose without
 *  the transport must meet the same ceiling an owner does. */
export class BudgetValidationError extends DomainOperationError {
  constructor(reason: string) {
    super("automation_budget_invalid", reason);
    this.name = this.constructor.name;
  }
}

/** A rule id names no row the caller may act on — collapses "no such rule" and "not a present member of
 *  its chat" into ONE leak-free answer (the chat-membership precedent). */
export class RuleNotFoundError extends DomainNotFoundError {
  public readonly ruleId: AutomationRuleId;
  constructor(ruleId: AutomationRuleId) {
    super("automation_rule", ruleId);
    this.ruleId = ruleId;
    this.name = this.constructor.name;
  }
}

/** S4 — a suggestion id names no pending ask the caller may act on. ONE leak-free answer collapsing every
 *  way an ask can be gone: never existed · already taken (the double-click / replace race — take-once) ·
 *  TTL-swept · voided by a host handoff or a rule disable · raised in a chat this caller is not a present
 *  member of. A host learning WHICH of those it was buys nothing and a non-member must learn nothing. */
export class SuggestionNotFoundError extends DomainNotFoundError {
  public readonly suggestionId: AutomationSuggestionId;
  constructor(suggestionId: AutomationSuggestionId) {
    super("automation_suggestion", suggestionId);
    this.suggestionId = suggestionId;
    this.name = this.constructor.name;
  }
}

/** S4 — the ask was CLAIMED (it is spent either way) and then refused by a re-check: the rule was disabled
 *  or deleted since it was raised, or its AUTHOR no longer holds host. A typed, user-visible refusal — the
 *  host asked for something that can no longer legitimately happen, and they are told which. */
export class SuggestionRefusedError extends DomainOperationError {
  constructor(code: string, reason: string) {
    super(`automation_suggestion_${code}`, reason);
    this.name = this.constructor.name;
  }
}

/** A chat-scoped rule verb (createRule/listRules/reorderRules) named a chat the caller is not a
 *  present member of — a leak-free not-found (a non-member never learns a foreign chat exists; the
 *  member-but-not-host case is a KNOWN existence and propagates `can()`'s DomainForbiddenError instead). */
export class AutomationChatNotFoundError extends DomainNotFoundError {
  public readonly chatId: ChatId;
  constructor(chatId: ChatId) {
    super("automation_chat", chatId);
    this.chatId = chatId;
    this.name = this.constructor.name;
  }
}
