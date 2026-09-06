// The durable-first producer write. The injected `emit` op wraps it: `record` is the durable core, the
// after-commit fan-out is the bus hook — the INSERT happens before any fan-out, so the event is deliverable
// from the table alone.
//
// Two belts run here: the closed `notificationEventSchema` is parsed (not just trusted from the type) so a
// credential/baseUrl smuggled onto the event can't survive into the persisted payload; the recipient is the
// event's mandatory `recipientUserId` — a producer delivers to a user, it isn't the caller.

import { notificationEventSchema } from "@orb/contracts/notifications";
import type { BatchStmt } from "@orb/db/kit";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RecordParams } from "../contract/params.ts";
import type { NotificationsContext, NotificationsService } from "../contract/service.ts";
import type { InboxView } from "../contract/views.ts";
import { insertNotification } from "../persistence/queries.ts";
import { asRaised } from "../substrate/actionable.ts";

export function createRecord(ctx: NotificationsContext): Pick<NotificationsService, "record"> {
  async function record(params: RecordParams): Promise<InboxView> {
    // Parse = the secret-free belt: the closed union strips any unknown key before it can reach the row.
    const event = notificationEventSchema.parse(params.event);

    const row = {
      id: mintTypeId(ID_PREFIX.notification),
      recipientUserId: event.recipientUserId,
      type: event.type,
      payload: event,
      createdAt: ctx.now(),
    };
    // When the producer supplies its membership-transition statements — or asks for singleton delivery —
    // the INSERT rides the same `db.batch`: a crash can never commit the transition without the durable
    // notification, and a supersede can never land without its replacement.
    // `asRaised` stamps `actionable` (#1799) with no cross-feature call: the producer writes this row
    // BECAUSE the decision exists, so a decision-carrying member is standing at the instant it is recorded.
    // It is what the bus publishes, so a live arrival raises the bell's dot without waiting for a re-list.
    const inserted = await insertNotification(ctx.db, row, {
      ...(params.coStatements !== undefined && params.coStatements.length > 0 ? { coStatements: params.coStatements as BatchStmt[] } : {}),
      ...(params.supersedeActiveOfSameType === true ? { supersedeActiveOfSameType: true } : {}),
    });
    return asRaised(inserted);
  }
  return { record };
}
