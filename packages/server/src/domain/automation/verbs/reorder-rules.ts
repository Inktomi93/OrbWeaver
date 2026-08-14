// verb: reorderRules — rewrite `position` over a chat's rules (host-only; the ST-familiar drag list). A
// TOTAL reorder: each position update is scoped to the chat, so a foreign id in the list can never touch
// another chat's row. Order is SEMANTICS — arms mutate the shared variable env in position order.

import type { ReorderRulesParams } from "../contract/params.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { applyReorder } from "../persistence/rules.ts";

export function createReorderRules(ctx: AutomationContext): AutomationService["reorderRules"] {
  return async ({ principal, chatId, orderedIds }: ReorderRulesParams): Promise<void> => {
    await requireChatHost(ctx, principal, chatId);
    await applyReorder(ctx.db, chatId, orderedIds, ctx.now());
    // Position IS a transform_draft rule's `PromptTransform.order` — a reorder re-ranks the pipeline.
    await ctx.transforms.reload();
    // Order IS semantics here (arms mutate the shared env in position order), so a reorder is a real change
    // to what the chat's rule set DOES — it announces exactly like a create/edit (survey H2/F5).
    ctx.notify({ type: "rulesChanged", chatId });
  };
}
