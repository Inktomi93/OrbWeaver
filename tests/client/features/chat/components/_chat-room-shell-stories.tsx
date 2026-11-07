import { useOrbSocket, useTRPC } from "@orb/client/data";
import { openChatMoment } from "@orb/client/state";
import type { MessageWindowTarget } from "@orb/contracts/search";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useEffect } from "react";

const INVALIDATE_ROOM_NAME = "Invalidate the room";

function RoomSocket(): null {
  useOrbSocket();
  return null;
}

/** The call the bus makes when a canon event lands, for a case that needs one invalidation at a chosen moment. */
function InvalidateRoom(): ReactElement {
  const trpc = useTRPC();
  const client = useQueryClient();
  const invalidate = (): void => {
    client.invalidateQueries(trpc.chat.listMessages.pathFilter()).catch(globalThis.reportError);
    client.invalidateQueries(trpc.chat.getMessageWindow.pathFilter()).catch(globalThis.reportError);
  };
  return <Button onClick={invalidate}>{INVALIDATE_ROOM_NAME}</Button>;
}

function OpenMoment({ chatId, target }: { readonly chatId: ChatId; readonly target: MessageWindowTarget }): null {
  useEffect(() => {
    openChatMoment(chatId, target);
  }, [chatId, target]);
  return null;
}

/** The production shell with one room opened the way a Chats row opens it, or on a moment the way a Corpus source opens it. */
export function ChatRoomShellStory({
  chatId,
  socket = false,
  invalidator = false,
  moment,
}: {
  readonly chatId: ChatId;
  readonly socket?: boolean;
  readonly invalidator?: boolean;
  readonly moment?: MessageWindowTarget;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtShellRoom chatId={chatId} />
      {socket ? <RoomSocket /> : null}
      {invalidator ? <InvalidateRoom /> : null}
      {moment === undefined ? null : <OpenMoment chatId={chatId} target={moment} />}
    </CtClientProviders>
  );
}
