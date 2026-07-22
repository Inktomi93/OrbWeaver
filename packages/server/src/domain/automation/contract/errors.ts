// domain/automation/contract/errors — the automation slice's typed errors. A cap/shape/validation violation
// is an INVALID operation (`DomainOperationError` → BAD_REQUEST); a missing rule collapses to a leak-free
// not-found (`DomainNotFoundError` → NOT_FOUND). The DB CHECK is the ultimate guard for stored shapes; the
// pre-validation here gives a clean, typed refusal before the write. A4 adds the rule-lifecycle errors.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { AutomationRuleId, ChatId } from "@orb/kit/ids";

/** A global-variable key/value violates its cap (02 §4 — key ≤ 128 chars, value ≤ 64 KiB, key non-empty). */
export class GlobalVariableInvalidError extends DomainOperationError {
  constructor(reason: string) {
    super("global_variable_invalid", reason);
  }
}

/** `createRule`/`updateRule` refused: the trigger is a RESERVED tuple member (typed but not wired v1 —
 *  01 §1). A user-visible refusal, never a silent no-op. */
export class AutomationReservedTriggerError extends DomainOperationError {
  constructor(triggerType: string) {
    super("automation_reserved_trigger", `trigger '${triggerType}' is reserved (not wired in v1)`);
    this.name = this.constructor.name;
  }
}

/** `createRule`/`updateRule` refused for a validation reason other than a reserved trigger: a reserved
 *  action arm, an unparseable CEL predicate, an out-of-range arm cap, a cooldown floor violation, or an
 *  unattached world-info book (03 §1 / 02 §1). Carries a machine `code` for the editor's inline surface. */
export class RuleValidationError extends DomainOperationError {
  constructor(code: string, reason: string) {
    super(`automation_rule_${code}`, reason);
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

/** A chat-scoped rule verb (createRule/listRules/reorderRules/setBudgets) named a chat the caller is not a
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
