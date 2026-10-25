import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production shell with one room opened the way a Chats row opens it. */
export function ChatRoomShellStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <CtShellRoom chatId={chatId} />
    </CtClientProviders>
  );
}
