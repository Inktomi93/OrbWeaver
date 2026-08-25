// verb: listChatActivity — B11 the room Activity read: a CHAT's recent fire log across ALL its rules,
// newest first (host-only). The room's "what happened out-of-band while I was away" surface: every
// automation dispatch/confirm/notice/plugin-tool run for the chat is a `automation_fires` row, so this is
// a READ of the SAME store the per-rule fire log consumes, scoped to the chat instead of one rule (ONE-HOME
// — B11 invents no second store). Chat-scoped, so authority is `requireChatHost` — a non-member collapses to
// a leak-free AutomationChatNotFoundError → NOT_FOUND, a member-not-host propagates `can()`'s FORBIDDEN.

import type { ListChatActivityParams } from "../contract/params.ts";
import type { FireView } from "../contract/results.ts";
import type { AutomationContext, AutomationService } from "../contract/service.ts";
import { requireChatHost } from "../guard.ts";
import { listFiresForChat } from "../persistence/fires.ts";

export function createListChatActivity(ctx: AutomationContext): AutomationService["listChatActivity"] {
  return async ({ principal, chatId, limit }: ListChatActivityParams): Promise<FireView[]> => {
    await requireChatHost(ctx, principal, chatId);
    return listFiresForChat(ctx.db, chatId, limit);
  };
}
