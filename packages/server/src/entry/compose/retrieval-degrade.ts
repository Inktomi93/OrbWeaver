// entry/compose/retrieval-degrade — the ONE place a chat turn is allowed to survive a search refusal (#2510).
//
// THE BOUNDARY IT EXISTS TO HOLD. `domain/search` refuses a query whose owner's vector space is not jointly
// complete (`search_space_reindexing`) or has no embed binding at all (`search_no_space`). For a SEARCH
// surface that refusal is correct and stays: scanning a half-migrated geometry with the live encoder returns
// dimensionally-valid, semantically meaningless rankings, and a named refusal is the only honest answer. But
// the two IN-TURN gather ops — `{{memory}}` recall and the `{{databank}}` slot — used to await search with no
// catch, so the refusal travelled out of the assembly and killed the turn with a 400. A turn's retrieval is an
// ENHANCEMENT to the turn; losing it costs the user context, not their message.
//
// WHY THE DECISION LIVES AT COMPOSE AND NOWHERE ELSE. Classifying the refusal needs `domain/search`'s error
// codes, and `domain/chat` importing them would be the sideways import constitution §2 forbids. The
// composition root is the one tier that legally sees both, which is why the CHAT side of the seam speaks a
// neutral `TurnRetrievalEvents` callback (`domain/chat/contract/context.ts`) and never a search code — the
// same shape the mixC rerank degrade already uses.
//
// EXACTLY TWO CODES, AND THE NARROWNESS IS THE POINT. Everything else still propagates and still faults the
// turn — in particular a real embed-credential auth failure, which `strikeOutOnTurnFault` (engine.ts, #1373
// chunk J) reasons about by identity. A blanket catch here would be a defect wearing a fix's clothes: it
// would turn every store failure, every malformed query and every backend outage into a silent empty recall.

import { SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "#domain/search";

/** True for the two refusals that describe the owner's SPACE rather than this query — the ordinary states
 *  (mid-move, or no embedder bound) a turn must survive. `SearchError` carries its code from
 *  `DomainOperationError`, so this is an identity test on a typed error, never a message match. */
function isSpaceRefusal(err: unknown): boolean {
  return err instanceof SearchError && (err.code === SEARCH_SPACE_REINDEXING || err.code === SEARCH_NO_SPACE);
}

/** Run an in-turn retrieval, degrading a SPACE refusal to `degraded.empty` and reporting it so the turn can
 *  tell the user (D41 — a silent degrade is the thing this repo forbids). Every other rejection is re-thrown
 *  untouched.
 *
 *  `run` comes FIRST so `T` infers from the retrieval's own return type rather than from an untyped `[]`.
 *  `onIndexUnavailable` is called BEFORE the fallback resolves, so a caller that keys its own trace off the
 *  report (recall's slice `note`) sees it in the same tick. */
export async function withRetrievalDegrade<T>(
  run: () => Promise<T>,
  degraded: { readonly empty: T; readonly onIndexUnavailable: (() => void) | undefined },
): Promise<T> {
  // No `@orb-waive caught-failure-ownership` marker here, deliberately: the gate finds nothing to waive
  // because this catch OWNS its failure — it re-throws everything it does not classify, and the one class it
  // absorbs is reported to the user through `onIndexUnavailable` rather than swallowed. A waiver was written,
  // the gate flagged it as a stale ordinary waiver, and it came back out.
  try {
    return await run();
  } catch (err) {
    if (!isSpaceRefusal(err)) {
      throw err;
    }
    degraded.onIndexUnavailable?.();
    return degraded.empty;
  }
}
