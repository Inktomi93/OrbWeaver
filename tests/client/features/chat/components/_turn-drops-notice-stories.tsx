import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom, CtUserBus } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production shell with one room open, beside the socket and user bus the app root wires, so a user event reaches the reads it changes. */
export function TurnDropsRoomStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <CtUserBus>
        <CtShellRoom chatId={chatId} />
      </CtUserBus>
    </CtClientProviders>
  );
}
