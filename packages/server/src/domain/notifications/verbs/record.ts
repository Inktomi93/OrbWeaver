// The durable-first producer write. The injected `emit` op wraps it: `record` is the durable core, the
// after-commit fan-out is the bus hook — the INSERT happens before any fan-out, so the event is deliverable
// from the table alone.
//
// Two belts run here: the closed `notificationEventSchema` is parsed (not just trusted from the type) so a
// credential/baseUrl smuggled onto the event can't survive into the persisted payload; the recipient is the
// event's mandatory `recipientUserId` — a producer delivers to a user, it isn't the caller.

import { notificationEventSchema } from "@orb/contracts/notifications";
import type { BatchStmt } from "@orb/db/kit";
import { DomainOperationError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RecordParams } from "../contract/params";
import type { NotificationsContext, NotificationsService } from "../contract/service";
import type { InboxView } from "../contract/views";
import { insertNotification, insertNotificationWith } from "../persistence/queries";

export function createRecord(ctx: NotificationsContext): Pick<NotificationsService, "record"> {
  async function record(params: RecordParams): Promise<InboxView> {
    // Parse = the secret-free belt: the closed union strips any unknown key before it can reach the row.
    const event = notificationEventSchema.parse(params.event);
    // An agent principal is structurally sessionless, so a notification addressed to one would only rot in
    // the table. Refuse it loud at this one write chokepoint, before the INSERT/coStatements batch, so a
    // refusal never half-commits a producer's membership transition.
    if (await ctx.isAgentRecipient(event.recipientUserId)) {
      throw new DomainOperationError("agent_recipient", "an agent principal has no inbox — a notification cannot be addressed to one (D60)");
    }
    const row = {
      id: mintTypeId(ID_PREFIX.notification),
      recipientUserId: event.recipientUserId,
      type: event.type,
      payload: event,
      createdAt: ctx.now(),
    };
    // When the producer supplies its membership-transition statements, the INSERT rides the same `db.batch`
    // — a crash can never commit the transition without the durable notification, or vice versa.
    if (params.coStatements !== undefined && params.coStatements.length > 0) {
      return await insertNotificationWith(ctx.db, row, params.coStatements as BatchStmt[]);
    }
    return await insertNotification(ctx.db, row);
  }
  return { record };
}
