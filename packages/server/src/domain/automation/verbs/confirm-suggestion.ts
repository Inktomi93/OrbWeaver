// verb: confirmSuggestion — S4's HOST YES (interaction-direction-spec §3-S4). Host-gated, take-once, and
// re-checked at the moment of execution rather than at the moment of asking.
//
// THE IDENTITY LAW, which is the whole point of the verb and the thing most likely to be "simplified" later:
// the executed frame's `authorUserId` STAYS THE RULE AUTHOR. Ownership, funding, the D19 triple and the
// variable namespace all key off the author — a confirmed turn is the AUTHOR's turn, funded by the author,
// writing into the author's namespace. The CONFIRMER is the AUTHORIZER ONLY: host-gated at the door and
// stamped on the fire row, never substituted into the frame. Running the arm as the confirmer would silently
// re-attribute spend and state to whoever happened to click.
//
// THE SEQUENCE, and why every step is where it is:
//   1. PEEK, then gate the caller as HOST OF THE ASK'S OWN CHAT. Peek first because the ask carries the chat
//      the gate needs; a caller who is not a present member collapses to the leak-free suggestion-not-found
//      (never `AutomationChatNotFound`, which would name a chat id the caller never supplied).
//   2. CLAIM — id-match, delete-on-take. This is the double-click / replace-race answer: two confirms of one
//      id both peek and both gate, and exactly ONE claims; the loser refuses typed. The claim happens BEFORE
//      the re-checks and is not rolled back if they fail, because a claimed ask is spent either way — the
//      alternative (put it back) is what turns a refusal into a retry loop against dead state.
//   3. RE-CHECK the two things that can have died since the ask was raised: the rule is still enabled (the
//      host may have withdrawn consent), and its AUTHOR still holds host (the RULED host-handoff wall — and
//      note the confirmer's own host role does NOT stand in for the author's).
//   4. EXECUTE by class. `confirm` runs the STASHED arm through the injected dispatcher with `confirmFirst`
//      cleared, in the STORED frame, and records a `fired` row stamped with the confirmer. `invitation` has
//      no stored payload by construction (`budget_refused` precedes predicate and env), so it runs the rule
//      FRESH through R7 — which records its own fire row and can honestly come back `predicate_false`.
//
// FIRE-LOG HONESTY (§3-S4 + §6 R5): `AUTOMATION_FIRE_OUTCOMES` gains NO suggestion terminal here. Nothing is
// written when an ask is RAISED — a suggestion is not a fire — and the CONFIRMED execution writes `fired`
// with the confirmer in `detail`. Adding a `suggested` terminal is a CHECK edit on a generated baseline and
// is recorded-unbuilt as R5, together with the per-rule `suggestOnRefusal` opt-out column.

import type { AutomationRunOutcome } from "@orb/contracts/automation";
import type { Principal } from "@orb/contracts/identity";
import { SuggestionNotFoundError, SuggestionRefusedError } from "../contract/errors.ts";
import type { PendingSuggestion, RuleRow } from "../contract/ops.ts";
import type { ConfirmSuggestionParams } from "../contract/params.ts";
import type { ConfirmSuggestionResult } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { loadCallerRole } from "../persistence/canon-reads.ts";
import { insertFire } from "../persistence/fires.ts";
import { selectRuleRow, stampRuleFired } from "../persistence/rules.ts";
import { holdsChatHostAuthority } from "../substrate/authority.ts";
import { dispatchRuleNow } from "../substrate/run-now.ts";
import { armToExecute } from "../substrate/suggestions.ts";

/** Gate the caller as HOST of the ask's chat. A non-present member collapses onto the ask's own leak-free
 *  not-found (so a stranger learns nothing, not even that the chat exists); a member-who-is-not-host is a
 *  KNOWN existence and gets `can()`'s FORBIDDEN — the `requireChatHost` split, re-spelled here only to
 *  change WHICH not-found is thrown. */
async function requireSuggestionHost(ctx: AutomationContext, principal: Principal, pending: PendingSuggestion): Promise<void> {
  const role = await loadCallerRole(ctx.db, pending.chatId, principal.userId);
  if (role === undefined) {
    throw new SuggestionNotFoundError(pending.id);
  }
  ctx.can(principal, "host", { kind: "chat", roster: { role } });
}

/** The two deaths a pending ask can suffer between raise and confirm. Both are TYPED refusals — the host
 *  asked for something that can no longer legitimately happen and is told which. */
async function assertStillLive(ctx: AutomationContext, pending: PendingSuggestion): Promise<RuleRow> {
  const rule = await selectRuleRow(ctx.db, pending.ruleId);
  if (rule === undefined || rule.chatId === null) {
    throw new SuggestionRefusedError("rule_gone", "the rule behind this suggestion no longer exists");
  }
  if (!rule.enabled) {
    throw new SuggestionRefusedError("rule_disabled", "the rule behind this suggestion has been disabled");
  }
  if (!(await holdsChatHostAuthority(ctx, pending.chatId, pending.authorUserId))) {
    throw new SuggestionRefusedError("author_lost_authority", "the rule's author no longer hosts this room");
  }
  return rule;
}

/** Execute the STASHED arm and record the confirmed fire, stamped with who authorized it. */
async function runStashedArm(ctx: AutomationContext, pending: PendingSuggestion, rule: RuleRow, confirmer: Principal): Promise<AutomationRunOutcome> {
  const stashed = pending.stashed;
  if (stashed === null) {
    // Unreachable through the store (a `confirm` always carries one), and a THROW rather than a silent
    // no-op: a confirm class with no payload is a broken invariant, not a user outcome.
    throw new SuggestionRefusedError("no_stashed_arm", "this suggestion carries nothing to execute");
  }
  const armOutcome = await ctx.runArm(armToExecute(stashed.action), stashed.frame);
  const outcome: AutomationRunOutcome = armOutcome.ok ? "fired" : "action_error";
  const nowMs = ctx.now();
  if (armOutcome.ok) {
    await stampRuleFired(ctx.db, pending.ruleId, nowMs);
  }
  await insertFire(ctx.db, {
    id: ctx.newFireId(),
    ruleId: pending.ruleId,
    chatId: pending.chatId,
    triggerType: rule.triggerType,
    outcome,
    detail: {
      confirmedByUserId: confirmer.userId,
      suggestionId: pending.id,
      armType: stashed.action.type,
      ...(armOutcome.ok ? {} : { error: armOutcome.detail }),
    },
    automationDepth: stashed.frame.origin.automationDepth,
    firedAt: nowMs,
  });
  ctx.notify(armOutcome.ok ? { type: "ruleFired", chatId: pending.chatId, ruleId: pending.ruleId } : { type: "ruleErrored", chatId: pending.chatId, ruleId: pending.ruleId });
  return outcome;
}

export function createConfirmSuggestion(ctx: AutomationContext): AutomationService["confirmSuggestion"] {
  return async ({ principal, suggestionId }: ConfirmSuggestionParams): Promise<ConfirmSuggestionResult> => {
    const nowMs = ctx.now();
    const seen = ctx.suggestions.peek(suggestionId, nowMs);
    if (seen === null) {
      throw new SuggestionNotFoundError(suggestionId);
    }
    await requireSuggestionHost(ctx, principal, seen);
    // TAKE-ONCE. The gate above awaited, so a racing confirm may have taken it in the meantime — that is
    // exactly the race this claim resolves, and the loser gets the same leak-free refusal as a stale id.
    const claimed = ctx.suggestions.claim(suggestionId, nowMs);
    if (claimed === null) {
      throw new SuggestionNotFoundError(suggestionId);
    }
    const rule = await assertStillLive(ctx, claimed);
    if (claimed.kind === "confirm") {
      return { ran: "stashed-arm", outcome: await runStashedArm(ctx, claimed, rule, principal) };
    }
    // The invitation class: no payload existed to stash, so the confirm is a FRESH host run (R7).
    const outcome = await dispatchRuleNow(ctx, rule, claimed.chatId, principal.userId);
    if (outcome === null) {
      throw new SuggestionRefusedError("not_runnable", "this rule cannot be run on demand");
    }
    return { ran: "fresh-run", outcome };
  };
}
