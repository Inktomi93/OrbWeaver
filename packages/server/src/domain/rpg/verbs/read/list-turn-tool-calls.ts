// domain/rpg/verbs/read/list-turn-tool-calls — listTurnToolCalls (TOOLCALLS-INVISIBLE, arm A). The window of
// recorded folded turns for a game, newest first, keyed by producing variant.
//
// MEMBER-GATED, not host-gated, and that is the whole product point: this is what the model DID in a room you
// are sitting in. Every sibling host-only read on this domain (`getConfigView`, `revealHidden`) gates because
// it exposes something a member is deliberately NOT shown — the GM's knobs, the hidden layer. A tool call is
// the opposite: it is the mechanical record of a turn everyone at the table just watched happen, and the
// symptom this closes is that *the person playing* cannot see it.
//
// NOT CONTENT-SAFE BY CONSTRUCTION — this header used to claim it was, and the claim was false (#1690, the
// #1528 class). It read: "the record carries tool NAMES + their ARGS, never prose". `args` is the RAW JSON
// STRING the model sent (`contracts/rpg/extraction.ts`), and the state tools write PROSE — ambient
// `location`/`weather`, an actor's mood and status, item and quest text, journal entries — so a `<lie …/>`
// truth an extractor quoted into a scene field arrives here as a tool arg. The `issues` line carries model
// bytes too: a dropped call's diagnostic embeds the value the model actually SENT at the failing path, and
// THAT is the half the panel paints.
//
// So the member gate above stays, and a SECOND question is answered beside it: not "may this caller act"
// (that is `resolveMember`) but "what may this viewer SEE" — chat's ONE `resolveViewerVisibility` verdict,
// the same op #1528's member-facing reads take (`get-tracker-view.ts`), never a re-derived `role === "host"`.
// A viewer who does not read hidden gets the args parsed and belted leaf by leaf; the host reads verbatim.
// The withhold arm for args that do not parse is the substrate's, and its reasoning lives there.
//
// NO HISTORY FLOOR HERE, stated so its absence is a decision: a tool-call record describes a turn's own
// mechanical writes and is keyed to the producing VARIANT, and the D16 floor is a `messages.seq` clamp on the
// CANON a member may read. A member who can see the message row can see what that turn did to the game they
// are sitting in — that is arm A's whole product point. `listJournal` is the rpg read that keeps distilled
// per-turn PROSE, and that is where the floor lands.

import type { RpgTurnToolCallsView } from "@orb/contracts/rpg";
import type { ListTurnToolCallsParams } from "../../contract/params.ts";
import type { RpgContext, RpgService } from "../../contract/service.ts";
import { resolveMember } from "../../guard.ts";
import { listTurnToolCalls as listRows } from "../../persistence/turn-tool-calls.ts";
import { projectFailureForViewer, projectToolCallsForViewer } from "../../substrate/tool-call-visibility.ts";

/** The transcript window a disclosure needs, in TURNS (message slots) — deep enough to cover a scrollback
 *  session, bounded so a long game never serves its whole history for a surface most people never open.
 *  Denominated in turns rather than rows so a reroll-heavy slot cannot evict an older SELECTED turn's
 *  disclosure (the persistence header's window-budget paragraph). Mirrors the journal's default depth. */
const DEFAULT_TURN_TOOL_CALLS_TURN_LIMIT = 50;

export function createListTurnToolCalls(ctx: RpgContext): Pick<RpgService, "listTurnToolCalls"> {
  async function listTurnToolCalls(params: ListTurnToolCallsParams): Promise<readonly RpgTurnToolCallsView[]> {
    const { game } = await resolveMember(ctx, params.principal, params.chatId);
    const [visibility, rows] = await Promise.all([
      ctx.resolveViewerVisibility(params.chatId, params.principal.userId),
      listRows(ctx.db, game.id, { turnLimit: params.turnLimit ?? DEFAULT_TURN_TOOL_CALLS_TURN_LIMIT }),
    ]);
    // A `null` visibility cannot happen behind `resolveMember` — and if it ever did it means "not a present
    // member", so the fail-CLOSED reading is "does not read hidden" (the `get-tracker-view.ts` posture).
    const readsHidden = visibility?.readsHidden ?? false;
    return rows.map((r) => ({
      variantId: r.variantId,
      messageId: r.messageId,
      calls: projectToolCallsForViewer(r.calls, readsHidden),
      // The round-could-not-run sentence, host-verbatim / summary-only for everyone else (#1468 item 2) — the
      // same viewer verdict the args ride, for the same reason.
      failure: projectFailureForViewer(r.failure, readsHidden),
      createdAt: r.createdAt,
    }));
  }
  return { listTurnToolCalls };
}
