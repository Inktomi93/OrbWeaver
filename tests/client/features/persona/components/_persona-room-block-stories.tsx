import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtShellRoom } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production shell with one room open, whose rail carries the persona switcher and its room block. */
export function PersonaRoomBlockStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <CtShellRoom chatId={chatId} />
    </CtClientProviders>
  );
}
