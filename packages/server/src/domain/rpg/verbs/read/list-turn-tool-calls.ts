// domain/rpg/verbs/read/list-turn-tool-calls — listTurnToolCalls (TOOLCALLS-INVISIBLE, arm A). The window of
// recorded folded turns for a game, newest first, keyed by producing variant.
//
// MEMBER-GATED, not host-gated, and that is the whole product point: this is what the model DID in a room you
// are sitting in. Every sibling host-only read on this domain (`getConfigView`, `revealHidden`) gates because
// it exposes something a member is deliberately NOT shown — the GM's knobs, the hidden layer. A tool call is
// the opposite: it is the mechanical record of a turn everyone at the table just watched happen, and the
// symptom this closes is that *the person playing* cannot see it.
//
// CONTENT-SAFE by construction: the record carries tool NAMES + their ARGS, never prose. The args are
// structured state writes the panel already renders the results of (a tracker moved, an item appeared), so a
// member reading them learns nothing the tracker view would not tell them one beat later.

import type { RpgTurnToolCallsView } from "@orb/contracts/rpg";
import type { ListTurnToolCallsParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { listTurnToolCalls as listRows } from "../../persistence/turn-tool-calls.ts";

/** The transcript window a disclosure needs — deep enough to cover a scrollback session, bounded so a long
 *  game never serves its whole history for a surface most people never open. Mirrors the journal's default. */
const DEFAULT_TURN_TOOL_CALLS_LIMIT = 50;

export function createListTurnToolCalls(ctx: RpgContext): Pick<RpgService, "listTurnToolCalls"> {
  async function listTurnToolCalls(params: ListTurnToolCallsParams): Promise<readonly RpgTurnToolCallsView[]> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const rows = await listRows(ctx.db, game.id, { limit: params.limit ?? DEFAULT_TURN_TOOL_CALLS_LIMIT });
    return rows.map((r) => ({ variantId: r.variantId, messageId: r.messageId, calls: r.calls, createdAt: r.createdAt }));
  }
  return { listTurnToolCalls };
}
