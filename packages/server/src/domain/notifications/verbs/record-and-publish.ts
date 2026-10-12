// Publication follows the durable record, including every producer statement in that record's batch.

import type { InboxView } from "@orb/contracts/notifications";
import type { RecordAndPublishNotification } from "../contract/publication.ts";
import type { NotificationsService } from "../contract/service.ts";

/** A failed durable write cannot publish an event that replay cannot deliver. */

export function createRecordAndPublishNotification(record: NotificationsService["record"], publish: (view: InboxView) => void): RecordAndPublishNotification {
  return async (event, coStatements): ReturnType<RecordAndPublishNotification> => {
    const view = await record({ event, ...(coStatements !== undefined ? { coStatements } : {}) });
    publish(view);
  };
}
