// The recorded-turn window, selected by producing variant (TOOLCALLS-INVISIBLE, arm A).
//
// ONE NETWORK READ PER ROOM, with one CHEAP SELECTOR per mounted assistant row. React Query deduplicates the
// chat-scoped read; selecting the row's own variant means the response wakes only disclosures whose value
// changed instead of publishing one new room-wide Map identity to every visible row.
//
// SWIPE-CORRECT WITH NO REFETCH: the selector keys on the row's OWN `selectedVariantId`, so swiping
// re-targets data the client already holds.
//
// GATED ON THE ROOM'S OWN RPG POINTER (side-eye 2026-08-07 P3). `listTurnToolCalls` resolves through
// `resolveMember`, whose not-found is LEAK-FREE BY DESIGN — a non-member and a no-game chat get the SAME
// `DomainNotFound` so a foreigner never learns whether a chat is a game (`domain/rpg/guard.ts` header). That
// refusal is correct and is NOT the defect; asking at all on a chat we already know has no game is. Every
// non-game committed room therefore printed a red `rpg.listTurnToolCalls ✗ … not found` on open, retried, and
// printed it again. The gate is the room's OWN pointer off `ChatDetail` — data the client already holds — read
// through the ONE `isRpgEngaged` predicate every other client gate uses (`contracts/rpg/pointer.ts`: "Every
// client gate reads THIS, never a re-spelled null-check — the OFF arm must gate identically everywhere"), so a
// game toggled OFF hides this disclosure exactly as it hides the panel, and re-engaging brings both back.
// Gating also kills the RETRY: a query that never fires has nothing to retry.

import type { RpgToolCallDisclosure, RpgTurnToolCallsView } from "@orb/contracts/rpg";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { ChatId, MessageVariantId } from "@orb/kit/ids";
import { useGatedQuery, useTRPC } from "#data";

/** How deep a scrollback the disclosure can answer for, in TURNS (message slots). Matches the server verb's
 *  own default — a deeper history would need both raised, which is the point of them being the same number.
 *
 *  TURNS, NOT ROWS (2026-08-14). The window used to be 50 ROWS, and rows are one-per-VARIANT: a reroll-heavy
 *  game spent the budget on dead swipes nobody can look at, and the disclosure went dark for older SELECTED
 *  turns still on screen. The server now windows by slot and serves every record of a windowed slot, so the
 *  siblings this hook's index needs still arrive AND cost the window nothing. */
const TURN_TOOL_CALLS_TURN_WINDOW = 50;

const EMPTY_CALLS: readonly RpgToolCallDisclosure[] = [];

/** The "this variant has no record" answer, hoisted to a module constant so a miss returns a STABLE identity
 *  (a fresh object per select would wake every mounted disclosure on every refetch of the room-wide read). */
const NO_RECORD: Pick<RpgTurnToolCallsView, "calls" | "failure"> = { calls: EMPTY_CALLS, failure: null };

/**
 * The record for one selected variant in the room's shared query window: what the turn CALLED, and — when the
 * state round could not run at all — the sentence saying so (#1468 item 2). Both, because a record can be
 * present with an EMPTY call list: that is exactly the failed turn, and a caller reading only `calls` would
 * render nothing for the one turn the disclosure exists for.
 *
 * A plain `useQuery`, deliberately NOT suspense: this is a footer ornament on a transcript that must render
 * immediately. Suspending here would hold the whole row list behind an observability read — the disclosure
 * simply appears when the data lands, and a room with no live game never ASKS at all (an empty index, no
 * request, no error — see the header's gate note).
 */
export function useTurnToolCallsForVariant(chatId: ChatId, variantId: MessageVariantId): Pick<RpgTurnToolCallsView, "calls" | "failure"> {
  const trpc = useTRPC();
  // Cache-first: every room surface already holds this read, so on a game room the gate costs no round-trip.
  const detail = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const isGame = isRpgEngaged(detail.data?.rpg ?? null);
  const { data } = useGatedQuery(isGame ? chatId : null, (id) => ({
    ...trpc.rpg.listTurnToolCalls.queryOptions({ chatId: id, turnLimit: TURN_TOOL_CALLS_TURN_WINDOW }),
    select: (rows: readonly RpgTurnToolCallsView[]): Pick<RpgTurnToolCallsView, "calls" | "failure"> => {
      const row = rows.find((r) => r.variantId === variantId);
      // `?? null` rather than a bare read: this is a WIRE value, and a payload from a server that predates the
      // field must read as "the round reached a verdict", never as a failure with no sentence (the `withheld`
      // precedent, one field over).
      return row === undefined ? NO_RECORD : { calls: row.calls, failure: row.failure ?? null };
    },
  }));
  return data ?? NO_RECORD;
}
