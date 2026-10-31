// Publication follows the durable record, including every producer statement in that record's batch. The op's
// type is its consumer's (D337): this verb satisfies it at the composition root.

import type { InboxView, NotificationEvent } from "@orb/contracts/notifications";
import type { RecordParams } from "../contract/params.ts";
import type { NotificationsService } from "../contract/service.ts";

/** A failed durable write cannot publish an event that replay cannot deliver. */

export function createRecordAndPublishNotification(
  record: NotificationsService["record"],
  publish: (view: InboxView) => void,
): (event: NotificationEvent, coStatements?: RecordParams["coStatements"]) => Promise<void> {
  return async (event, coStatements): Promise<void> => {
    const view = await record({ event, ...(coStatements !== undefined ? { coStatements } : {}) });
    publish(view);
  };
}
