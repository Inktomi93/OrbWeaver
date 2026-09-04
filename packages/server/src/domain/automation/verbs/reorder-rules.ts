// verb: reorderRules — rewrite `position` over a chat's rules (host-only; the ST-familiar drag list). A
// TOTAL reorder: each position update is scoped to the chat, so a foreign id in the list can never touch
// another chat's row. Order is SEMANTICS — arms mutate the shared variable env in position order, which is
// why "total" is ENFORCED here (`assertTotalOrder`) and not merely asserted in this sentence (#1429).

import type { AutomationRuleId, ChatId } from "@orb/kit/ids";
import { RuleReorderError } from "../contract/errors.ts";
import type { ReorderRulesParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { applyReorder, listRuleIdsForChat } from "../persistence/rules.ts";

/** THE TOTALITY GATE (#1429). `applyReorder` writes `position = array index` per id, so the list is not a
 *  preference — it IS the chat's new total order, and anything that is not a permutation of the chat's
 *  current rule set silently produces a broken one: an OMITTED rule keeps its old position (now colliding
 *  with a rewritten one), a DUPLICATE id is written twice and wins its last index, and a FOREIGN id touches
 *  no row at all (the batch's per-statement chat predicate) while still consuming an index and shifting
 *  everything after it. All three reported success. Order is semantics — arms mutate the shared variable env
 *  in position order — so a silently non-total order changes what the room's automation DOES.
 *
 *  Checked BEFORE the batch, so a refusal writes nothing at all. The refusal never names an id: a caller
 *  guessing rule ids must not learn from the error whether one exists. */
async function assertTotalOrder(ctx: AutomationContext, chatId: ChatId, orderedIds: readonly AutomationRuleId[]): Promise<void> {
  const requested = new Set<AutomationRuleId>(orderedIds);
  if (requested.size !== orderedIds.length) {
    throw new RuleReorderError("duplicate", "a reorder must list each rule exactly once");
  }
  const current = await listRuleIdsForChat(ctx.db, chatId);
  if (orderedIds.some((id) => !current.includes(id))) {
    throw new RuleReorderError("foreign", "a reorder may only list this chat's own rules");
  }
  if (current.length !== requested.size) {
    throw new RuleReorderError("incomplete", `a reorder must list ALL ${current.length} of this chat's rules — it rewrites the whole order`);
  }
}

export function createReorderRules(ctx: AutomationContext): AutomationService["reorderRules"] {
  return async ({ principal, chatId, orderedIds }: ReorderRulesParams): Promise<void> => {
    await requireChatHost(ctx, principal, chatId);
    await assertTotalOrder(ctx, chatId, orderedIds);
    await applyReorder(ctx.db, chatId, orderedIds, ctx.now());
    // Position IS a transform_draft rule's `PromptTransform.order` — a reorder re-ranks the pipeline.
    // `refresh`, not `reload` (#1431): the positions are written, so an index failure latches stale rather
    // than rejecting a committed operation.
    await ctx.transforms.refresh();
    // Order IS semantics here (arms mutate the shared env in position order), so a reorder is a real change
    // to what the chat's rule set DOES — it announces exactly like a create/edit (survey H2/F5).
    ctx.notify({ type: "rulesChanged", chatId });
  };
}
