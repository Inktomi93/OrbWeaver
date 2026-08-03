// verb: listRules — a chat's rules in position order (host-only in v1). Rules can encode a hidden hand (the
// crew-director `audience` lesson), so member transparency is a LEAN v2 (a clamped "N rules active" view,
// not rule bodies). The read is lazy-parse fault-isolated per row (a corrupt arm blob degrades that ONE rule
// to empty arms — never nukes the list).

import type { ListRulesParams } from "../contract/params.ts";
import type { RuleView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { listRuleRowsForChat, toRuleView } from "../persistence/rules.ts";

export function createListRules(ctx: AutomationContext): AutomationService["listRules"] {
  return async ({ principal, chatId }: ListRulesParams): Promise<RuleView[]> => {
    await requireChatHost(ctx, principal, chatId);
    const rows = await listRuleRowsForChat(ctx.db, chatId);
    return rows.map(toRuleView);
  };
}
