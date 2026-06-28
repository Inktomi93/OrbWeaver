// verb: record — the DURABLE-FIRST producer write (notifications.md §verbs + invariant #1). The injected
// `emit` op (composed at entry from this verb + transport's per-user bus) wraps it: `record` is the durable
// core, the after-commit fan-out is the bus hook — the INSERT happens BEFORE any fan-out, so the event is
// deliverable from the table alone (kill the bus → `list` still returns it).
//
// Two belts run here:
//   • SECRET-FREE write seam — the closed `notificationEventSchema` is PARSED (not just trusted from the
//     type): every member is a `z.object` that STRIPS unknown keys, so a credential/baseUrl smuggled onto
//     the event (even via a cast at the producer) does NOT survive into the persisted `payload`
//     (notifications.md invariant #2 — the union is the phishing/exfil belt).
//   • RECIPIENT — the recipient is the event's MANDATORY `recipientUserId` (the producer names it; it is
//     by definition not the producer). No Principal: a producer delivers TO a user, it isn't the caller.
// The `seq` is db-driven (persistence) and the id is minted via the one `mintTypeId` primitive; `createdAt`
// is the injected clock (no ambient `Date.now()` — determinism).

import { notificationEventSchema } from "@orb/contracts/notifications";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RecordParams } from "../contract/params";
import type { NotificationsContext, NotificationsService } from "../contract/service";
import type { InboxView } from "../contract/views";
import { insertNotification } from "../persistence/queries";

export function createRecord(ctx: NotificationsContext): Pick<NotificationsService, "record"> {
  async function record(params: RecordParams): Promise<InboxView> {
    // Parse = the secret-free belt: the closed union strips any unknown key before it can reach the row.
    const event = notificationEventSchema.parse(params.event);
    // FLAG[PD-24]: durable-first runs on `ctx.db` (INSERT-before-fan-out — invariant #1, tested). The
    // stronger "INSERT INSIDE the producer's membership-transition tx" atomicity needs a tx-executor seam
    // that does not exist yet (no domain threads a tx; chat — the producer — is built LAST, D16). When chat
    // lands, widen `record`/the context to accept the producer's tx executor here — a one-line change.
    return await insertNotification(ctx.db, {
      id: mintTypeId(ID_PREFIX.notification),
      recipientUserId: event.recipientUserId,
      type: event.type,
      payload: event,
      createdAt: ctx.now(),
    });
  }
  return { record };
}
