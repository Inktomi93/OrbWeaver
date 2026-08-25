// domain/automation/substrate/notification-recipients — THE ONE resolution of a `NotificationRecipient`
// selector into the concrete inbox rows a notice is written to. Both producers of the `automation-notice`
// event resolve here: the `post_notification` ARM (`engine/arm-executors`, host = the rule author) and the
// PLUGIN `notify` capability (wired at `entry/compose/automation-plugin`, host = the installer). They differ
// only in who "host" is and in whether an actor exists, which is exactly what the two arguments carry — so
// the AXIS itself has one home and a new member cannot land on one path and silently miss the other.
//
// WHY A SWITCH WITH `default: never` AND NOT A TERNARY: this is the §5.5 dispatch discipline, and it is here
// because the binary `recipient === "host" ? … : …` this replaces was the defect shape — a third member
// would have fallen into the all-members branch at BOTH call sites with nothing red. The exhaustive form
// makes the next member a `tsc` error naming this file.
//
// A recipient set is PARTICIPANTS ONLY, always: every branch either names the host or filters the present
// human roster, so no path here can address a non-member.

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import type { NotificationRecipientQuery } from "../contract/ops.ts";
import { loadPresentHumanMemberIds } from "../persistence/canon-reads.ts";

/** Resolve a recipient selector into the users whose inbox receives the notice. The query shape (and WHY
 *  `actorUserId` is unbranded and nullable) is `contract/ops.ts::NotificationRecipientQuery`. */
export async function resolveNotificationRecipients(db: Db, query: NotificationRecipientQuery): Promise<UserId[]> {
  switch (query.recipient) {
    case "host":
      return [query.hostUserId];
    case "all_members":
      return await loadPresentHumanMemberIds(db, query.chatId);
    case "all_members_except_actor": {
      const members = await loadPresentHumanMemberIds(db, query.chatId);
      return query.actorUserId === null ? members : members.filter((memberId) => memberId !== query.actorUserId);
    }
    default: {
      const exhaustive: never = query.recipient;
      throw new Error(`unhandled notification recipient: ${JSON.stringify(exhaustive)}`);
    }
  }
}
