import { useHuskReaper } from "@orb/client/data";
import { enterCreatedChat, goToLanding } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

function Reaper(): null {
  useHuskReaper();
  return null;
}

/** The production shell on one room, the app root's husk reaper, and the store actions that enter a room as just
 *  created and leave it. */
export function HuskReapSendStory({ chatId, otherChatId }: { readonly chatId: ChatId; readonly otherChatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Reaper />
      <Button onClick={(): void => enterCreatedChat(chatId)}>Enter the new room</Button>
      <Button onClick={(): void => enterCreatedChat(otherChatId)}>Enter another new room</Button>
      <Button onClick={goToLanding}>Go to the landing</Button>
      <CtShellRoom chatId={chatId} />
    </CtClientProviders>
  );
}
