// A room's canon as its viewer reads it: every page of the production `listMessages` verb, oldest first.

import type { MessageView } from "@orb/contracts/chat";
import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { ChatId } from "@orb/kit/ids";
import type { ServerProducerRoot } from "../server.ts";

/** Walk the viewer's whole history backward a page at a time and return it chronologically. */
export async function readRoomCanon(root: ServerProducerRoot, principal: Principal, chatId: ChatId): Promise<MessageView[]> {
  const pages: (readonly MessageView[])[] = [];
  let beforeSeq: number | undefined;
  for (;;) {
    const { messages } = await root.services.chat.listMessages({ principal, chatId, limit: CHAT_MESSAGE_LIST_MAX_LIMIT, beforeSeq });
    pages.unshift(messages);
    const oldest = messages[0];
    if (messages.length < CHAT_MESSAGE_LIST_MAX_LIMIT || oldest === undefined) {
      return pages.flat();
    }
    beforeSeq = oldest.seq;
  }
}
