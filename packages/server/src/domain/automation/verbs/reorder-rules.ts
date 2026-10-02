// Scope-authorized total order: the pre-read gives legible refusals; the SQL write admits the exact set.
// A chat includes all authors' rules, while a global lane belongs only to the authenticated caller.
// Positions are execution semantics, so a changed set writes no position or timestamp and emits nothing.

import type { AutomationRuleId } from "@orb/kit/ids";
import { RuleReorderError } from "../contract/errors.ts";
import type { RuleOrderScope } from "../contract/ops.ts";
import type { ReorderRulesParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { applyReorder, listRuleIdsForChat, listRuleIdsForScope } from "../persistence/rules.ts";

/** THE TOTALITY GATE (#1429). `applyReorder` writes `position = array index` per id, so the list is not a
 *  preference — it IS the chat's new total order, and anything that is not a permutation of the chat's
 *  current rule set silently produces a broken one: an OMITTED rule keeps its old position (now colliding
 *  with a rewritten one), a DUPLICATE id is written twice and wins its last index, and a FOREIGN id touches
 *  no row at all (the batch's per-statement chat predicate) while still consuming an index and shifting
 *  everything after it. All three reported success. Order is semantics — arms mutate the shared variable env
 *  in position order — so a silently non-total order changes what the room's automation DOES.
 *
 *  This pre-read is not the concurrency guarantee; applyReorder checks the set again in its SQL snapshot.
 *  The refusal never names an id: a caller
 *  guessing rule ids must not learn from the error whether one exists. */
async function assertTotalOrder(ctx: AutomationContext, scope: RuleOrderScope, orderedIds: readonly AutomationRuleId[]): Promise<void> {
  const requested = new Set<AutomationRuleId>(orderedIds);
  if (requested.size !== orderedIds.length) {
    throw new RuleReorderError("duplicate", "a reorder must list each rule exactly once");
  }
  const current = scope.chatId === null ? await listRuleIdsForScope(ctx.db, scope) : await listRuleIdsForChat(ctx.db, scope.chatId);
  if (orderedIds.some((id) => !current.includes(id))) {
    throw new RuleReorderError(
      "foreign",
      scope.chatId === null ? "a reorder may only list this owner's global rules" : "a reorder may only list this chat's own rules",
    );
  }
  if (current.length !== requested.size) {
    throw new RuleReorderError("incomplete", `a reorder must list ALL ${current.length} rules in this scope — it rewrites the whole order`);
  }
}

export function createReorderRules(ctx: AutomationContext): AutomationService["reorderRules"] {
  return async ({ principal, chatId, orderedIds }: ReorderRulesParams): Promise<void> => {
    if (chatId !== null) {
      await requireChatHost(ctx, principal, chatId);
    }
    const scope: RuleOrderScope = chatId === null ? { chatId: null, ownerId: principal.userId } : { chatId };
    await assertTotalOrder(ctx, scope, orderedIds);
    if (!(await applyReorder(ctx.db, scope, orderedIds, ctx.now()))) {
      throw new RuleReorderError("changed", "The rule set changed before reordering. Reload the list and reorder the complete set.");
    }
    if (orderedIds.length === 0) {
      return;
    }
    // Position IS a transform_draft rule's `PromptTransform.order` — a reorder re-ranks the pipeline.
    // `refresh`, not `reload` (#1431): the positions are written, so an index failure latches stale rather
    // than rejecting a committed operation.
    await ctx.transforms.refresh();
    // Order IS semantics here (arms mutate the shared env in position order), so a reorder is a real change
    // to what the chat's rule set DOES — it announces exactly like a create/edit (survey H2/F5).
    if (chatId !== null) {
      ctx.notify({ type: "rulesChanged", chatId });
    }
  };
}
