import { useOrbSocket } from "@orb/client/data";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import type { ReactElement } from "react";

function RoomSocket(): null {
  useOrbSocket();
  return null;
}

/** The production shell with one room opened the way a Chats row opens it. */
export function ChatRoomShellStory({ chatId, socket = false }: { readonly chatId: ChatId; readonly socket?: boolean }): ReactElement {
  return (
    <CtClientProviders>
      <CtShellRoom chatId={chatId} />
      {socket ? <RoomSocket /> : null}
    </CtClientProviders>
  );
}
