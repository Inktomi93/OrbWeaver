// verbs: refreshStanding · retract — the two producer writes a STANDING ASK needs beyond `record` (#1041).
// Both are recipient-ADDRESSED (a producer acts FOR a user, it is not the caller), where `dismiss` is
// caller-scoped because dismissing is the READER's act.
//
// A STANDING ASK IS NOT AN EPISODIC EVENT, and that difference is this file. "Nine plugins are waiting for
// your permission" is a claim that stays true until it stops being true, so its inbox row has THREE
// lifecycle moves an invite never has, and each is a different verb because each answers a different
// question about the reader's attention:
//   · the ask GREW (a new plugin is asking)  → `record` with `supersedeActiveOfSameType` — a fresh row, a
//     fresh badge. There IS new information, so interrupting again is honest.
//   · the ask SHRANK (one was answered)      → `refreshStanding` — the number is corrected IN PLACE, with
//     `seq`/`readAt` untouched, so answering nine asks one at a time badges the bell ZERO extra times. A
//     supersede here would re-badge on every grant, which is the re-prompt loop the aggregate exists to
//     prevent (owner ruling on #924: "no dead end, no re-prompt loop").
//   · the ask is GONE (all answered)         → `retract`. Recording a `pendingCount: 0` row instead would
//     be a lie the reader can only discover by acting on it, which is why the contract makes the count
//     `.min(1)` and the zero case lands here.
// A reader who DISMISSED the row has no active row of the type, so both verbs no-op for them — a dismissed
// ask is a settled state, never a reason to resurrect the row underneath them.
//
// The rows each verb actually changed come back so the composed op can publish them: a live reader treats
// any inbox frame as "re-read the inbox", so publishing is what makes the bell agree without a reload.

import { notificationEventSchema } from "@orb/contracts/notifications";
import type { RefreshStandingParams, RetractParams } from "../contract/params.ts";
import type { NotificationsContext, NotificationsService } from "../contract/service.ts";
import type { InboxView } from "../contract/views.ts";
import { dismissActiveOfType, updateActivePayloadOfType } from "../persistence/queries.ts";
import { asRaised, asSettled } from "../substrate/actionable.ts";

export function createStanding(ctx: NotificationsContext): Pick<NotificationsService, "refreshStanding" | "retract"> {
  async function refreshStanding(params: RefreshStandingParams): Promise<readonly InboxView[]> {
    // The same parse belt `record` runs: the stored payload is only ever a value the closed union produced,
    // whichever verb wrote it.
    const event = notificationEventSchema.parse(params.event);
    // Still standing — a correction in place is never a settlement (#1799).
    const corrected = await updateActivePayloadOfType(ctx.db, event.recipientUserId, event);
    return corrected.map(asRaised);
  }

  async function retract(params: RetractParams): Promise<readonly InboxView[]> {
    // Retracted = settled: the producer no longer has the ask (#1799).
    const withdrawn = await dismissActiveOfType(ctx.db, params.recipientUserId, params.type, ctx.now());
    return withdrawn.map(asSettled);
  }

  return { refreshStanding, retract };
}
