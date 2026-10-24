// Message seeds run the production verbs and return their outcomes; rows-tier twins in `rows/message.ts` read the rows.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatService } from "@orb/server/domain/chat";
import type { ServerProducerRoot } from "../server.ts";

/** The user commit owns send regex, greeting freeze, room claim, seq allocation and persona attribution. */
export async function seedMessage(root: ServerProducerRoot, params: Parameters<ChatService["commitMessage"]>[0]): Promise<MessageView> {
  const outcome = await root.services.chat.commitMessage(params);
  const [message, ...rest] = outcome.messages;
  if (message === undefined || rest.length > 0) {
    throw new Error("production message commit did not return exactly one canonical slot");
  }
  return message;
}
