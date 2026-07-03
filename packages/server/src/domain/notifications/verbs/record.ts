// verb: record — the DURABLE-FIRST producer write. The injected
// `emit` op (composed at entry from this verb + transport's per-user bus) wraps it: `record` is the durable
// core, the after-commit fan-out is the bus hook — the INSERT happens BEFORE any fan-out, so the event is
// deliverable from the table alone (kill the bus → `list` still returns it).
//
// Two belts run here:
//   • SECRET-FREE write seam — the closed `notificationEventSchema` is PARSED (not just trusted from the
//     type): every member is a `z.object` that STRIPS unknown keys, so a credential/baseUrl smuggled onto
//     the event (even via a cast at the producer) does NOT survive into the persisted `payload`
//     (the union is the phishing/exfil belt).
//   • RECIPIENT — the recipient is the event's MANDATORY `recipientUserId` (the producer names it; it is
//     by definition not the producer). No Principal: a producer delivers TO a user, it isn't the caller.
// The `seq` is db-driven (persistence) and the id is minted via the one `mintTypeId` primitive; `createdAt`
// is the injected clock (no ambient `Date.now()` — determinism).

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
    // D60 recipient belt (agent-principal-design/06 §3 + inv 2): an agent principal is structurally
    // sessionless (no session → no subscription), so a notification addressed to one would only ROT in the
    // table. Refuse it LOUD at this ONE write chokepoint — covering EVERY producer (chat invite/kick/handoff
    // today; automation `post_notification`, crew `crew-proposal`, plugin `notify` when they land — all
    // human-targeted, but their `all_members`/participant fan-outs must exclude agents, and this is the
    // backstop). Runs BEFORE the INSERT / `coStatements` batch so a refusal never HALF-commits a producer's
    // membership transition (PD-24 tx-atomicity).
    if (await ctx.isAgentRecipient(event.recipientUserId)) {
      throw new DomainOperationError(
        "agent_recipient",
        "an agent principal has no inbox — a notification cannot be addressed to one (D60)",
      );
    }
    const row = {
      id: mintTypeId(ID_PREFIX.notification),
      recipientUserId: event.recipientUserId,
      type: event.type,
      payload: event,
      createdAt: ctx.now(),
    };
    // PD-24 TX-ATOMICITY: when the producer supplies its membership-transition statements, the INSERT rides
    // the SAME `db.batch` (one implicit transaction) — a crash can never commit the transition without the
    // durable notification, or vice versa. The params contract erases the statements to `unknown` (the
    // `ApplyStatsDelta` generic-batch precedent); this executor restores the concrete `BatchStmt` type.
    if (params.coStatements !== undefined && params.coStatements.length > 0) {
      return await insertNotificationWith(ctx.db, row, params.coStatements as BatchStmt[]);
    }
    return await insertNotification(ctx.db, row);
  }
  return { record };
}
