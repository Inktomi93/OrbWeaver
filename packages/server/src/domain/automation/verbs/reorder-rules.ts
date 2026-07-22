// verb: reorderRules — rewrite `position` over a chat's rules (host-only; the ST-familiar drag list). A
// TOTAL reorder: each position update is scoped to the chat, so a foreign id in the list can never touch
// another chat's row. Order is SEMANTICS — arms mutate the shared variable env in position order (04 §3).

import type { ReorderRulesParams } from "../contract/params";
import type { AutomationContext, AutomationService } from "../contract/service";
import { requireChatHost } from "../guard";
import { applyReorder } from "../persistence/rules";

export function createReorderRules(ctx: AutomationContext): AutomationService["reorderRules"] {
  return async ({ principal, chatId, orderedIds }: ReorderRulesParams): Promise<void> => {
    await requireChatHost(ctx, principal, chatId);
    await applyReorder(ctx.db, chatId, orderedIds, ctx.now());
    // Position IS a transform_draft rule's `PromptTransform.order` (A7) — a reorder re-ranks the pipeline.
    await ctx.transforms.reload();
  };
}
