// domain/refinery/persistence/apply-basis — the reads both terminal apply verbs run before their write half, then
// the belt intersection over them (`substrate/accept-belts.ts`).

import type { CharacterCard } from "@orb/contracts/character";
import type { AppliedFieldRef, DroppedField, RefineryRewriteField, RefinerySessionView } from "@orb/contracts/refinery";
import { appendedRewrites, REFINERY_STAGE_PAYLOADS } from "@orb/contracts/refinery";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefineryRunId, RefinerySessionId, UserId } from "@orb/kit/ids";
import { RefineryStageNotReadyError } from "../contract/errors.ts";
import type { AcceptedField } from "../contract/params.ts";
import type { RefineryContext } from "../contract/service.ts";
import { partitionAccepts } from "../substrate/accept-belts.ts";
import { latestRunRowOf, loadOwnedSessionRow, loadSessionRewriteRunRow, sessionViewOf } from "./queries.ts";

/** Everything both terminal verbs resolve BEFORE their write half: the owned session, the chosen rewrite
 *  run (latest, or the §16.1 operate-back pin — session-scoped, leak-free), the LIVE card, and the belt
 *  intersection over the accepts. ONE resolver so the merge and branch-off arms cannot drift a load or a
 *  belt (`substrate/accept-belts.ts`'s one-writer law, extended to the preamble). */
export async function resolveApplyBasis(
  ctx: RefineryContext,
  args: {
    readonly ownerId: UserId;
    readonly sessionId: RefinerySessionId;
    readonly rewriteRunId: RefineryRunId | undefined;
    readonly accepts: readonly AcceptedField[];
  },
): Promise<{
  readonly session: RefinerySessionView;
  readonly liveCard: CharacterCard;
  readonly applied: AppliedFieldRef[];
  readonly dropped: DroppedField[];
  readonly chosen: RefineryRewriteField[];
  /** The APPLIED rewrite's own `(createdAt, id)` — the correlation cutoff: a caller stamping signals
   *  onto a copy/merge must correlate to THIS rewrite, never the session's head (`latestRunRowAtOrBefore`
   *  in `persistence/queries.ts`), because an operate-back apply of an OLDER named rewrite must not stamp
   *  a NEWER score/analyze run that describes different content. */
  readonly rewriteRunCutoff: { readonly createdAt: number; readonly id: RefineryRunId };
}> {
  const { ownerId, sessionId, rewriteRunId, accepts } = args;
  const row = await loadOwnedSessionRow(ctx.db, ownerId, sessionId);
  if (row === undefined) {
    throw new DomainNotFoundError("refinery session", sessionId);
  }
  const session = sessionViewOf(row);
  const rewriteRow =
    rewriteRunId === undefined ? await latestRunRowOf(ctx.db, sessionId, "rewrite") : await loadSessionRewriteRunRow(ctx.db, sessionId, rewriteRunId);
  if (rewriteRunId !== undefined && rewriteRow === undefined) {
    throw new DomainNotFoundError("refinery run", rewriteRunId);
  }
  if (rewriteRow === undefined) {
    throw new RefineryStageNotReadyError("There is no rewrite to apply yet — run the rewrite stage first.");
  }
  const rewrite = REFINERY_STAGE_PAYLOADS.rewrite.safeParse(rewriteRow.payload);
  if (!rewrite.success) {
    throw new RefineryStageNotReadyError("There is no rewrite to apply yet — run the rewrite stage first.");
  }
  // The LIVE card — the greeting-index assert runs against THIS, never the session snapshot (a greeting
  // deleted since session start must not be re-created by index; §1 gap 3's verb-tier ruling).
  const liveCard = await ctx.loadOwnedCard({ ownerId, characterId: session.characterId });
  if (liveCard === undefined) {
    throw new DomainNotFoundError("character", session.characterId);
  }
  const { applied, dropped, chosen } = partitionAccepts(accepts, {
    rewriteFields: rewrite.data.fields,
    selectedFields: session.selection.fields,
    selectedGreetingIndexes: session.selection.greetingIndexes,
    liveGreetingCount: liveCard.greetings.length,
    liveHasDepthPrompt: liveCard.depthPrompt !== null,
    appendedFields: appendedRewrites(rewrite.data.fields),
    originalCard: session.originalCard,
    liveCard,
  });
  const cutoff = { createdAt: rewriteRow.createdAt, id: rewriteRow.id };
  // ATOMIC (Apply is a commit, Keep/Discard is staging): one refused entry refuses the whole apply, because
  // writing the rest would produce a card the user never reviewed as a whole. Recovery is the user discarding
  // the refused entries explicitly, never a silent partial write.
  if (dropped.length > 0) {
    return { session, liveCard, applied: [], dropped, chosen: [], rewriteRunCutoff: cutoff };
  }
  return { session, liveCard, applied, dropped, chosen, rewriteRunCutoff: cutoff };
}
