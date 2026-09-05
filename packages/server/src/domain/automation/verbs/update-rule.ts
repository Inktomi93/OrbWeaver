// verb: updateRule — replace a rule's editable fields (host-only, 04 §2). Same validation as createRule;
// resets the error ledger (`consecutive_errors`/`last_error` — a fresh authoring pass clears the auto-
// disable countdown). The chat/owner/position/enabled state is immutable here (enable is its own verb;
// reorder is its own verb). Returns the stored view.

import type { UpdateRuleParams } from "../contract/params.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireRuleAuthority } from "../guard.ts";
import { applyRuleUpdate, selectRuleRow, toRuleView } from "../persistence/rules.ts";
import { notifyRulesChanged } from "../substrate/rule-feed.ts";
import { RULE_MAX_FIRES_DEFAULT, validateRuleInput } from "../substrate/validate.ts";

export function createUpdateRule(ctx: AutomationContext): AutomationService["updateRule"] {
  return async (params: UpdateRuleParams): Promise<RuleView> => {
    const rule = await requireRuleAuthority(ctx, params.principal, params.ruleId);
    const cooldownSeconds = params.cooldownSeconds ?? 0;
    const maxFiresPerHour = params.maxFiresPerHour ?? RULE_MAX_FIRES_DEFAULT;
    // The SCOPE is the rule's OWN and is immutable here — an edit can move a rule's trigger, arms and caps,
    // never the lane it lives in. Passing the stored `chatId` (rather than anything the caller sent) is what
    // makes that true: there is no field on this verb that could move a room's rule onto the owner-global
    // lane, where its arms would face a different admission matrix.
    const { actions } = await validateRuleInput(
      ctx,
      { chatId: rule.chatId, authorUserId: rule.ownerId },
      {
        trigger: params.trigger,
        predicateCel: params.predicateCel,
        actions: params.actions,
        cooldownSeconds,
        maxFiresPerHour,
        // THE RULE'S OWNER, not the editing caller. `requireRuleAuthority` admits any host of the rule's chat, and an
        // edited rule still dispatches as its original author — so a co-host must not be able to point it at a
        // tool that author cannot drive. Reachability is a question about who ACTS, never about who typed.
        authorUserId: rule.ownerId,
      },
    );
    // S4 — THE VOID RUNS BEFORE THE WRITE (#1564, #1424's residue). Voiding only after `applyRuleUpdate` left a
    // real window: a confirm that claims the card in the gap re-checks a rule that exists, is enabled and is
    // still hosted by its author — all true — and then executes the STASHED PRE-EDIT arm against the edited
    // rule. Voiding first makes that unreachable. If the write below then fails, the cost is a dropped card for
    // a rule that did not change, which is one re-fire away; the other order's cost is running an act the host
    // just edited out.
    ctx.suggestions.voidRule(params.ruleId);
    await applyRuleUpdate(ctx.db, params.ruleId, {
      name: params.name,
      description: params.description ?? null,
      triggerBus: params.trigger.bus,
      triggerType: params.trigger.type,
      predicateCel: params.predicateCel ?? null,
      actions,
      // ANY edit clears the mint provenance — the row is no longer exactly what its preset mints, and
      // the saved-cast capture / B2's knob editor must not read a knob bag that lies about the rule
      // (v1's knob-edit path stays re-mint, §3-S3).
      rulePresetId: null,
      rulePresetKnobs: null,
      matchAutomationEvents: params.matchAutomationEvents ?? false,
      cooldownSeconds,
      maxFiresPerHour,
      updatedAt: ctx.now(),
    });
    const row = await selectRuleRow(ctx.db, params.ruleId);
    if (row === undefined) {
      throw new Error(`updateRule: row ${params.ruleId} vanished immediately after update`);
    }
    // THE SECOND VOID (#1424 · #1564), and it is not redundant: the one above the write closes the
    // confirm-in-the-gap window, this one closes its MIRROR — a dispatch that RAISED a card while the write was
    // in flight, whose stashed arm is the pre-edit one too. Both are an in-RAM scan of one rule's slots.
    // A pending card stores the arm as it RESOLVED at fire time and confirming executes that STASHED arm, which
    // is why neither the confirm's own liveness re-check (exists / enabled / author still hosts — every one of
    // them still true after an edit) nor either void alone is enough. The honest surface for a rule that no
    // longer says what its card says is no card. `setRuleEnabled(false)` and `deleteRule` make the same call.
    ctx.suggestions.voidRule(params.ruleId);
    // An enabled rule's trigger BUS can change (chat↔domain) — refresh the pre-check's domain-rule flag.
    // `refresh`, not `reload` (#1431): the row above is already written, so an index failure must not reject
    // an operation that SUCCEEDED — it latches stale and the watcher front door rebuilds on the next event.
    await ctx.enabled.refresh();
    // A rule edit can add/remove transform_draft arms or change their target/template/predicate/order.
    await ctx.transforms.refresh();
    // The roster announces itself AFTER the write AND after both in-process indexes reconcile (survey H2/F5):
    // a subscriber that re-reads on this event must not observe a rule whose transform registration is still
    // the pre-edit one. `chatId` comes off the guard-loaded row (the rule's chat is immutable here).
    notifyRulesChanged(ctx, rule.chatId);
    return toRuleView(row);
  };
}
